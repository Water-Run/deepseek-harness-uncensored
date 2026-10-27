/** Canonical network matching and deterministic production/test precedence. @module */
import { domainToASCII, domainToUnicode } from 'node:url'
import { isIP } from 'node:net'
import { RE2JS } from 're2js'
import ipaddr from 'ipaddr.js'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { TargetProtectionError } from './errors.ts'
import { canonicalLocalPath } from './file-identity.ts'
import type { NetworkTarget, RuleAddresses, TargetDecision, TargetEffect, TargetPreferences, TargetRule, TargetRuleId, TargetSelector, FlatTargetRule } from './types.ts'

/**
 * Normalize a host field. URLs, ports and credentials must use their separate fields.
 * @param value - Hostname or IPv4/IPv6 literal, optionally with URL IPv6 brackets.
 * @returns ASCII lower-case hostname or canonical IP, mapping IPv4-in-IPv6 to IPv4.
 */
export function canonicalTargetHost(value: string): string {
  const input = value.trim().replace(/^\[([^\]]+)\]$/u, '$1')
  if (input.includes('%')) throw new TargetProtectionError('invalid', 'Scoped or escaped host addresses are not supported.')
  if (isIP(input) !== 0) return ipaddr.process(input).toString()
  if (/[\s/@?#:\\%]/u.test(input)) throw new TargetProtectionError('invalid', 'Enter a hostname or IP without credentials, path or port.')
  let url: URL
  try { url = new URL(`http://${input}`) }
  catch (error) { throw new TargetProtectionError('invalid', 'Invalid hostname or IP address.', { cause: error }) }
  const host = url.hostname.toLowerCase().replace(/\.$/u, '')
  if (isIP(host) !== 0) return ipaddr.process(host).toString()
  return canonicalDnsName(host)
}

/**
 * Normalize DNS labels without interpreting a numeric name as a URL IPv4 shorthand.
 * @param value - DNS record owner or alias name.
 * @returns Lower-case ASCII DNS name without a trailing root separator.
 */
export function canonicalDnsName(value: string): string {
  const input = value.trim().replace(/[.\u3002\uFF0E\uFF61]$/u, '')
  if (/[\s/@?#:\\%]/u.test(input)) throw new TargetProtectionError('invalid', 'Invalid DNS name.')
  // A nonnumeric suffix selects IDNA processing without WHATWG IPv4 reinterpretation.
  const encoded = domainToASCII(`${input}.invalid`).toLowerCase()
  const ascii = encoded.endsWith('.invalid') ? encoded.slice(0, -8) : ''
  if (!ascii || ascii.length > 253 || !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/u.test(ascii)
    || ascii.split('.').some(label => label.length > 63)) {
    throw new TargetProtectionError('invalid', 'Invalid hostname.')
  }
  return ascii
}

function observedName(value: string): string {
  const literal = value.replace(/^\[([^\]]+)\]$/u, '$1')
  return isIP(literal) ? canonicalTargetHost(literal) : canonicalDnsName(value)
}

const selectorFields = {
  match: z.enum(['host', 'domain', 'regex', 'cidr', 'path']),
  address: z.string().trim().min(1).max(512), port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1).max(128).optional(),
}
const selectorSchema = z.object(selectorFields).strict().transform(({ port, database, ...value }) => ({ ...value,
  ...port === undefined ? {} : { port }, ...database === undefined ? {} : { database },
}))
const ruleSchema = z.object({
  id: z.uuid().transform(value => brandString<TargetRuleId>(value)),
  name: z.string().trim().min(1).max(100), enabled: z.boolean(),
  kind: z.enum(['domain', 'server', 'database']), environment: z.enum(['production', 'test']),
  protection: z.enum(['full', 'audit']), ...selectorFields,
  aliases: z.array(selectorSchema).optional(),
}).strict().transform(({ port, database, aliases, ...value }) => ({ ...value,
  ...port === undefined ? {} : { port }, ...database === undefined ? {} : { database },
  ...aliases === undefined ? {} : { aliases },
}))
const preferencesSchema = z.object({ mainlandEnabled: z.boolean(), rules: z.array(ruleSchema) }).strict()

/**
 * Validate a complete wire/file value and compile all rules before accepting it.
 * @param input - Untrusted configuration data.
 * @returns Credential-free normalized settings with no shared caller-owned objects.
 */
export function parseTargetPreferences(input: unknown): TargetPreferences {
  const parsed = preferencesSchema.safeParse(input)
  if (!parsed.success) throw new TargetProtectionError('invalid', 'Invalid target protection settings.', { cause: parsed.error })
  const value = parsed.data
  const ids = new Set<TargetRuleId>()
  for (const rule of value.rules) {
    if (ids.has(rule.id)) throw new TargetProtectionError('invalid', 'Target rule IDs must be unique.')
    ids.add(rule.id)
    const selectors = new Set<string>()
    for (const selector of [rule, ...rule.aliases ?? []]) {
      normalizeSelector(selector, rule)
      const key = JSON.stringify([selector.match, selector.address, selector.port ?? null, selector.database ?? null])
      if (selectors.has(key)) throw new TargetProtectionError('invalid', 'A resource cannot repeat the same target selector.')
      selectors.add(key)
    }
  }
  for (const selector of expandTargetRules(value)) compileRule(selector)
  return value
}

function normalizeSelector(selector: TargetSelector, policy: TargetRule): void {
  if (selector.database !== undefined && policy.kind !== 'database') throw new TargetProtectionError('invalid', 'A database name needs a database resource.')
  if (policy.environment === 'test' && selector.match !== 'host' && selector.match !== 'path') {
    throw new TargetProtectionError('invalid', 'Test exceptions require an exact hostname, IP or local path.')
  }
  if (selector.match === 'path') {
    if (policy.kind === 'domain' || selector.port !== undefined || selector.database !== undefined) {
      throw new TargetProtectionError('invalid', 'A local path requires a server or database resource without network qualifiers.')
    }
    selector.address = canonicalLocalPath(selector.address)
  }
  if (selector.match === 'host' || selector.match === 'domain') selector.address = canonicalTargetHost(selector.address)
}

/**
 * Expand validated resource selectors while sharing one immutable policy and rule ID.
 * @param preferences - Parsed owner preferences.
 * @returns Independent flat records; network qualifiers never leak into a path alias.
 */
export function expandTargetRules(preferences: TargetPreferences): FlatTargetRule[] {
  return preferences.rules.flatMap(({ match, address, port, database, aliases, ...policy }) => {
    const primary: TargetSelector = { match, address, ...port === undefined ? {} : { port }, ...database === undefined ? {} : { database } }
    return [primary, ...aliases ?? []].map(selector => ({ ...policy, ...selector }))
  })
}

interface CompiledRule { rule: TargetRule; matches: (host: string) => boolean }

function compileRule(rule: TargetRule): CompiledRule {
  try {
    switch (rule.match) {
      case 'path': return { rule, matches: () => false }
      case 'host': return { rule, matches: host => host === rule.address }
      case 'domain': {
        if (isIP(rule.address)) throw new TargetProtectionError('invalid', 'Use an exact host or CIDR rule for IP addresses.')
        return { rule, matches: host => host === rule.address || host.endsWith(`.${rule.address}`) }
      }
      case 'regex': {
        const pattern = RE2JS.compile(rule.address, RE2JS.CASE_INSENSITIVE)
        return { rule, matches: (host) => {
          if (pattern.matcher(host).find()) return true
          if (isIP(host)) return false
          const unicode = domainToUnicode(`${host}.invalid`).slice(0, -8)
          return unicode !== '' && unicode !== host && pattern.matcher(unicode).find()
        } }
      }
      case 'cidr': {
        let [network, bits] = ipaddr.parseCIDR(rule.address)
        if (network instanceof ipaddr.IPv6 && network.isIPv4MappedAddress()) {
          if (bits < 96) throw new TargetProtectionError('invalid', 'An IPv4-mapped network needs a prefix of at least 96 bits.')
          network = network.toIPv4Address(); bits -= 96
        }
        return { rule, matches: (host) => {
          if (!isIP(host)) return false
          const address = ipaddr.process(host)
          return address.kind() === network.kind() && address.match(network, bits)
        } }
      }
    }
  } catch (error) {
    if (error instanceof TargetProtectionError) throw error
    throw new TargetProtectionError('invalid', 'Invalid target rule pattern or network.', { cause: error })
  }
}

function qualifiers(rule: TargetRule, target: NetworkTarget): 'match' | 'different' | 'unknown' {
  if (rule.port !== undefined && target.port !== undefined && rule.port !== target.port) return 'different'
  if (rule.database !== undefined && target.database !== undefined && rule.database !== target.database) return 'different'
  if ((rule.port !== undefined && target.port === undefined) || (rule.database !== undefined && target.database === undefined)) return 'unknown'
  return 'match'
}

/** Compiled immutable selection; every decision receives fresh transport and DNS facts. */
export class TargetRules {
  private readonly entries: readonly CompiledRule[]
  private readonly preferences: TargetPreferences

  /**
   * @param input - Complete settings, copied and validated before use.
   */
  constructor(input: TargetPreferences) {
    this.preferences = parseTargetPreferences(input)
    this.entries = expandTargetRules(this.preferences).filter(rule => rule.enabled && rule.match !== 'path')
      .sort((a, b) => Number(a.environment === 'test') - Number(b.environment === 'test')
        || Number(a.protection === 'audit') - Number(b.protection === 'audit')).map(compileRule)
  }

  /**
   * Return exact named rules whose address aliases require fresh DNS resolution.
   * @param target - When supplied, omit selectors whose port or database cannot match; omission returns all active selectors.
   * @returns Applicable hostname selectors; literals need no resolver.
   */
  namedHosts(target?: NetworkTarget): readonly TargetRule[] {
    return this.entries.filter(entry => target === undefined || qualifiers(entry.rule, target) !== 'different')
      .map(entry => ({ ...entry.rule })).filter(rule => rule.match === 'host' && !isIP(rule.address))
  }

  /**
   * Refuse a definite full-production name before resolving the requested target.
   * @param target - Logical request identity; unresolved addresses are permitted here.
   * @returns A definite denial, or undefined when final address-aware validation remains necessary.
   */
  preflight(target: NetworkTarget): TargetDecision | undefined {
    const names = target.names.map(observedName)
    for (const entry of this.entries) {
      if (entry.rule.environment !== 'production' || entry.rule.protection !== 'full') continue
      const qualifier = qualifiers(entry.rule, target)
      if (qualifier === 'different' || !names.some(entry.matches)) continue
      return { allowed: false, code: qualifier === 'unknown' ? 'TARGET_IDENTITY_UNVERIFIED' : 'TARGET_FULLY_PROTECTED', ruleIds: [entry.rule.id] }
    }
    return undefined
  }

  /**
   * Evaluate every supplied target together; any production denial wins over all test exceptions.
   * @param targets - Verified executor identities, including all pinned addresses and DNS aliases.
   * @param effect - Effect guaranteed by the actual operation, never a model classification.
   * @param bindings - Fresh DNS bindings keyed by canonical hostname; missing/failed entries remain unknown.
   * @returns Permission or stable refusal with matching rule IDs.
   */
  decide(targets: readonly NetworkTarget[], effect: TargetEffect, bindings: RuleAddresses): TargetDecision {
    if (!this.preferences.mainlandEnabled && !this.entries.some(entry => entry.rule.environment === 'production')) return { allowed: true, ruleIds: [] }
    if (targets.length === 0) return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [] }
    const selected = new Set<TargetRuleId>()
    for (const target of targets) {
      const names = target.names.map(observedName)
      const addresses = target.addresses?.map(canonicalTargetHost) ?? null
      if (addresses === null || addresses.length === 0) return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [] }
      const identities = [...names, ...addresses]
      const testAddresses = new Set<string>()
      for (const entry of this.entries) {
        const qualifier = qualifiers(entry.rule, target)
        if (qualifier === 'different') continue
        let matches = identities.some(entry.matches)
        let unknown = false
        if (entry.rule.match === 'host' && !isIP(entry.rule.address)) {
          const aliases = bindings.get(entry.rule.address)
          if (aliases === undefined || aliases === null) unknown = !matches
          else matches ||= aliases.map(canonicalTargetHost).some(address => addresses.includes(address))
        } else if (!matches && (target.nameResolution === 'unknown' || names.every(name => isIP(name) !== 0))
          && (entry.rule.match === 'domain' || entry.rule.match === 'regex')) {
          unknown = true
        }
        if (entry.rule.environment === 'test') {
          if (matches && qualifier === 'match') {
            selected.add(entry.rule.id)
            if (!isIP(entry.rule.address) && names.includes(entry.rule.address)) {
              for (const address of addresses) testAddresses.add(address)
            } else {
              const aliases = bindings.get(entry.rule.address) ?? []
              for (const address of addresses) if (address === entry.rule.address || aliases.includes(address)) testAddresses.add(address)
            }
          }
          continue
        }
        if (unknown || (matches && qualifier === 'unknown')) return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [entry.rule.id] }
        if (!matches) continue
        selected.add(entry.rule.id)
        if (entry.rule.protection === 'full') return { allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: [entry.rule.id] }
        if (effect !== 'observe') return { allowed: false, code: 'TARGET_READ_ONLY', ruleIds: [entry.rule.id] }
      }
      if (this.preferences.mainlandEnabled && !addresses.every(address => testAddresses.has(address))) {
        if (target.mainland === 'unknown') return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: [] }
        if (target.mainland === 'yes' && effect !== 'observe') return { allowed: false, code: 'TARGET_MAINLAND_PROTECTED', ruleIds: [] }
      }
    }
    return { allowed: true, ruleIds: [...selected] }
  }
}
