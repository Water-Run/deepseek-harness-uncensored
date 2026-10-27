/** Durable target rules and network admission; no model assessment grants permission. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { resolvePublicAddresses } from '@deepseek-ai/dsh-web-fetch-http'
import type { HttpFetchDestination, PublicAddress } from '@deepseek-ai/dsh-web-fetch-http'
import { canonicalTargetHost, TargetRules } from './rules.ts'
import { TargetStore } from './store.ts'
import { TargetProtectionError } from './errors.ts'
import type {} from './country-provider.ts'
import { resolveTargetDns, systemHostsFile, type TargetDnsResolution } from './dns-resolution.ts'
import { parseDnsServer } from './dns-transport.ts'
import { canonicalLocalPath, resolveLocalPathIdentity, localPathContains } from './file-identity.ts'
import { decideLocalTarget, type LocalTargetOperation } from './file-rules.ts'
import type { NetworkTarget, TargetDecision, TargetPreferences, TargetRuleId, TargetSnapshot } from './types.ts'

export type * from './types.ts'
export { TargetProtectionError } from './errors.ts'
export { canonicalTargetHost, parseTargetPreferences, TargetRules } from './rules.ts'
export { TargetStore } from './store.ts'

/** Deployment-owned store and bounded resolution. */
export interface Config {
  /** Registry file belonging only to target protection. */
  path: string
  /** SQLite lock wait in milliseconds, default 1000. */
  busyTimeoutMs?: number
  /** Deadline for one address-aware check, default 5000 milliseconds. */
  checkTimeoutMs?: number
  /** Maximum rechecks after a concurrent settings change, default 3. */
  maxRechecks?: number
  /** Empty follows the OS-configured DNS servers; explicit entries are literal IP[:port] endpoints. */
  dnsServers?: string[]
  /** Hosts file used before DNS; empty disables it, omission uses the system file. */
  hostsFile?: string
  /** Per-server DNS exchange timeout in milliseconds, default 1500. */
  dnsQueryTimeoutMs?: number
  /** Maximum accepted CNAME depth, default 8. */
  dnsMaxCnameDepth?: number
  /** Maximum names or addresses retained from a resolution, default 256. */
  dnsMaxRecords?: number
  /** Hosts-file byte bound, default 1 MiB. */
  hostsMaxBytes?: number
  /** Additional owner-only configuration and credential files; all Agent access is refused. */
  ownerPaths?: string[]
  /** Additional local data sources that Agents may read but must not change. */
  readOnlyPaths?: string[]
}
type ResolvedConfig = Required<Config>

/** Name evidence and policy-validated addresses from the same resolution. */
export interface TargetHttpResolution extends Omit<TargetDnsResolution, 'addresses'> {
  addresses: readonly PublicAddress[]
}

/** File identity and policy revision selected for the executing local provider. */
export interface LocalFileAdmission { path: string; revision: number; decision: TargetDecision }

declare module '@deepseek-ai/cordis' {
  interface Context { /** Current target registry and deterministic execution decisions. */ targetProtection: TargetProtection }
}

/** Root owner; the HTTP consumer requires this service and cannot fall back after its removal. */
export default class TargetProtection extends Service {
  static Config: schema<Config, ResolvedConfig> = schema.object({
    path: schema.string().required(), busyTimeoutMs: schema.natural().max(30000).default(1000),
    checkTimeoutMs: schema.natural().min(1).max(300000).default(5000), maxRechecks: schema.natural().min(1).max(20).default(3),
    dnsServers: schema.array(String).default([]), hostsFile: schema.string().default(systemHostsFile()),
    dnsQueryTimeoutMs: schema.natural().min(1).max(30000).default(1500),
    dnsMaxCnameDepth: schema.natural().min(1).max(64).default(8), dnsMaxRecords: schema.natural().min(1).max(4096).default(256),
    hostsMaxBytes: schema.natural().min(1).max(16777216).default(1048576),
    ownerPaths: schema.array(String).default([]), readOnlyPaths: schema.array(String).default([]),
  })
  private readonly config: ResolvedConfig
  private readonly ready: Promise<TargetStore>
  private opened: TargetStore | undefined
  private readonly lifetime = new AbortController()
  private generation = new AbortController()
  private readonly checking = new Set<Promise<unknown>>()

  /**
   * @param ctx - Service owner whose lifetime contains all pending checks.
   * @param config - Explicit path and deployment limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'targetProtection')
    this.config = TargetProtection.Config(config)
    if (this.config.path !== ':memory:') this.config.path = canonicalLocalPath(resolve(this.config.path))
    if (this.config.hostsFile !== '') this.config.hostsFile = canonicalLocalPath(resolve(this.config.hostsFile))
    this.config.ownerPaths = this.config.ownerPaths.map(canonicalLocalPath)
    this.config.readOnlyPaths = this.config.readOnlyPaths.map(canonicalLocalPath)
    for (const server of this.config.dnsServers) parseDnsServer(server)
    this.ready = TargetStore.open(this.config.path, this.config.busyTimeoutMs)
    ctx.on('target-country/changed', () => { this.invalidate() })
    void this.ready.catch((_error: unknown) => { /* Service.init reports the failure; disposal also observes this promise. */ })
    ctx.effect(() => async () => {
      this.lifetime.abort(new TargetProtectionError('unavailable', 'Target protection is closing.'))
      await Promise.allSettled(this.checking)
      const opened = await Promise.allSettled([this.ready])
      if (opened[0].status === 'fulfilled') opened[0].value.close()
    }, 'target-protection.store')
  }

  /** Refuse activation when durable settings cannot be validated. */
  protected async [Service.init](): Promise<void> { this.opened = await this.ready }

  /**
   * Admit only executions whose effects are bounded by a structured adapter. Arbitrary code cannot establish a target set.
   * @returns Denial while any production or mainland rule is active; otherwise permission.
   * @throws When initialization, durable settings or the service lifetime is unavailable.
   */
  checkUnconfined(): TargetDecision {
    this.lifetime.signal.throwIfAborted()
    if (this.opened === undefined) throw new TargetProtectionError('unavailable', 'Target protection is not ready.')
    const { preferences } = this.opened.snapshot()
    const rules = preferences.rules.filter(rule => rule.enabled && rule.environment === 'production')
    const ownerResources = this.config.path !== ':memory:' || this.config.ownerPaths.length > 0
      || this.config.readOnlyPaths.length > 0 || this.config.hostsFile !== '' || this.ctx.get('targetCountryData') !== undefined
    if (preferences.mainlandEnabled || rules.length > 0 || ownerResources) {
      return { allowed: false, code: 'TARGET_EXECUTION_UNCONFINED', ruleIds: rules.map(rule => rule.id) }
    }
    return { allowed: true, ruleIds: [] }
  }

  /**
   * Check a host-local operation against current path rules and protected owner files.
   * @param path - Absolute path supplied by the local executing provider.
   * @param operation - Actual operation implemented by that provider.
   * @param signal - Operation lifetime, including policy-change cancellation.
   * @returns The checked canonical path, current revision and decision; unavailable identity rejects.
   */
  checkLocalFile(path: string, operation: LocalTargetOperation, signal: AbortSignal): Promise<LocalFileAdmission> {
    this.lifetime.signal.throwIfAborted()
    const checking = this.checkFile(path, operation, signal)
    this.checking.add(checking)
    return checking.finally(() => { this.checking.delete(checking) })
  }

  private async checkFile(path: string, operation: LocalTargetOperation, signal: AbortSignal): Promise<LocalFileAdmission> {
    using timeout = deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_FILE_TIMEOUT')
    const store = await this.ready
    const owner = [...this.config.ownerPaths, ...this.config.path === ':memory:' ? []
      : [this.config.path, `${this.config.path}-wal`, `${this.config.path}-shm`, `${this.config.path}-journal`]]
    const sources = [...this.config.readOnlyPaths, ...this.config.hostsFile === '' ? [] : [this.config.hostsFile],
      ...this.ctx.get('targetCountryData')?.sourcePaths() ?? []]
    for (let attempt = 0; attempt < this.config.maxRechecks; attempt++) {
      const snapshot = store.snapshot()
      const target = await resolveLocalPathIdentity(path, timeout.signal)
      for (const source of [...owner, ...operation === 'mutate' ? sources : []]) {
        const resource = await resolveLocalPathIdentity(source, timeout.signal)
        const sameFile = target.fileId !== undefined && target.fileId === resource.fileId
        const overlap = [resource.path, resource.canonical].some(root => [target.path, target.canonical].some(candidate =>
          localPathContains(root, candidate) || ((operation === 'mutate' || operation === 'list' || operation === 'watch') && localPathContains(candidate, root))))
        if (sameFile || overlap) return { path: target.canonical, revision: snapshot.revision,
          decision: { allowed: false, code: 'TARGET_OWNER_RESOURCE', ruleIds: [] } }
      }
      const rules = []
      for (const rule of snapshot.preferences.rules.filter(rule => rule.enabled && rule.match === 'path')) {
        rules.push({ rule, identity: await resolveLocalPathIdentity(rule.address, timeout.signal) })
      }
      timeout.signal.throwIfAborted()
      if (store.snapshot().revision !== snapshot.revision) continue
      return { path: target.canonical, revision: snapshot.revision, decision: decideLocalTarget(target, operation, rules) }
    }
    throw new TargetProtectionError('conflict', 'Target settings kept changing during file validation.')
  }

  /**
   * Read current committed settings; shutdown never supplies empty defaults.
   * @returns The latest durable revision and rule values.
   */
  async snapshot(): Promise<TargetSnapshot> {
    this.lifetime.signal.throwIfAborted()
    const store = await this.ready
    this.lifetime.signal.throwIfAborted()
    return store.snapshot()
  }

  /**
   * Save owner-selected preferences after a revision check.
   * @param preferences - Complete normalized rules.
   * @param expectedRevision - The caller's previously read revision.
   * @returns Committed successor settings.
   */
  async configure(preferences: TargetPreferences, expectedRevision: number): Promise<TargetSnapshot> {
    this.lifetime.signal.throwIfAborted()
    const store = await this.ready
    this.lifetime.signal.throwIfAborted()
    const saved = store.configure(preferences, expectedRevision)
    this.invalidate()
    return saved
  }

  private invalidate(): void {
    this.generation.abort(new TargetProtectionError('conflict', 'Target policy changed during the operation.'))
    this.generation = new AbortController()
  }

  /**
   * Capture cancellation for one operation using the current policy and country-data generation.
   * @returns A signal aborted on local configuration change, country-source replacement or shutdown.
   */
  executionSignal(): AbortSignal {
    this.lifetime.signal.throwIfAborted()
    return AbortSignal.any([this.lifetime.signal, this.generation.signal])
  }

  /**
   * Retain rule resources for an executing adapter until its native I/O and cleanup have settled.
   * @returns An idempotent release function; obtain it before starting I/O and release it in finally.
   * @throws When protection is closing and cannot admit another operation.
   */
  retainExecution(): () => void {
    this.lifetime.signal.throwIfAborted()
    const settled = Promise.withResolvers<boolean>()
    this.checking.add(settled.promise)
    return () => { settled.resolve(true); this.checking.delete(settled.promise) }
  }

  /**
   * Check the actual HTTP destination. Ordinary GET is treated as an unverified effect.
   * @param destination - Authority and pinned-address facts from the HTTP transport.
   * @param signal - Request cancellation and deadline.
   * @param resolution - Name evidence produced by the actual address-pinning resolver, when available.
   * @returns Stable rule decision; unavailable stores reject rather than granting permission.
   */
  checkHttp(destination: HttpFetchDestination, signal: AbortSignal, resolution?: TargetHttpResolution): Promise<TargetDecision> {
    this.lifetime.signal.throwIfAborted()
    const operation = this.check(destination, signal, resolution)
    this.checking.add(operation)
    return operation.finally(() => { this.checking.delete(operation) })
  }

  /**
   * Resolve names and addresses together, retaining the shared public-address and NAT64 protections.
   * @param hostname - URL hostname to resolve.
   * @param signal - Request cancellation and deadline.
   * @returns Bound DNS evidence and the exact validated address set for connection pinning.
   */
  resolveHttpTarget(hostname: string, signal: AbortSignal): Promise<TargetHttpResolution> {
    this.lifetime.signal.throwIfAborted()
    const operation = this.resolveTarget(hostname, signal)
    this.checking.add(operation)
    return operation.finally(() => { this.checking.delete(operation) })
  }

  private dnsOptions() {
    return { servers: this.config.dnsServers, hostsFile: this.config.hostsFile,
      queryTimeoutMs: this.config.dnsQueryTimeoutMs, maxCnameDepth: this.config.dnsMaxCnameDepth,
      maxRecords: this.config.dnsMaxRecords, maxHostsBytes: this.config.hostsMaxBytes }
  }

  private async resolveTarget(hostname: string, signal: AbortSignal): Promise<TargetHttpResolution> {
    using timeout = deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_DNS_TIMEOUT')
    const options = this.dnsOptions()
    const resolution = await resolveTargetDns(hostname, options, timeout.signal)
    const addresses = await resolvePublicAddresses(hostname, timeout.signal, async (name) => {
      const value = canonicalTargetHost(name) === resolution.hostname ? resolution : await resolveTargetDns(name, options, timeout.signal)
      return [...value.addresses]
    })
    timeout.signal.throwIfAborted()
    return { ...resolution, addresses }
  }

  private async check(destination: HttpFetchDestination, signal: AbortSignal, resolution?: TargetHttpResolution): Promise<TargetDecision> {
    using timeout = deadline(AbortSignal.any([signal, this.executionSignal()]), this.config.checkTimeoutMs, 'TARGET_CHECK_TIMEOUT')
    const hostname = canonicalTargetHost(destination.hostname)
    const verified = resolution !== undefined && resolution.hostname === hostname
      && destination.phase === 'before-connect' && destination.route === 'direct'
      && resolution.addresses.length === destination.addresses.length
      && resolution.addresses.every((item, index) => {
        const peer = destination.addresses.at(index)
        return peer !== undefined && item.address === peer.address && item.family === peer.family
          && item.translatedIpv4 === peer.translatedIpv4
      })
    const target: NetworkTarget = {
      names: verified ? resolution.names : [hostname], port: destination.port,
      nameResolution: verified ? 'verified' : 'unknown',
      addresses: destination.phase === 'before-connect' && destination.route === 'direct'
        ? destination.addresses.flatMap(address => address.translatedIpv4 === undefined
          ? [address.address] : [address.address, address.translatedIpv4]) : null,
      mainland: 'unknown',
    }
    const store = await this.ready
    for (let attempt = 0; attempt < this.config.maxRechecks; attempt++) {
      timeout.signal.throwIfAborted()
      const snapshot = store.snapshot()
      const namedMainland = target.names.some(host => ['cn', 'xn--fiqs8s', 'xn--fiqz9s'].some(tld => host === tld || host.endsWith(`.${tld}`)))
      target.mainland = namedMainland ? 'yes' : 'unknown'
      const rules = new TargetRules(snapshot.preferences)
      const early = rules.preflight(target)
      if (early !== undefined) return early
      if (destination.phase === 'before-resolution' && snapshot.preferences.mainlandEnabled && namedMainland
        && !snapshot.preferences.rules.some(rule => rule.enabled && rule.environment === 'test')) {
        return { allowed: false, code: 'TARGET_MAINLAND_PROTECTED', ruleIds: [] }
      }
      if (destination.phase === 'before-resolution') return { allowed: true, ruleIds: [] }
      const bindings = new Map<TargetRuleId, readonly string[] | null>()
      for (const rule of rules.namedHosts()) {
        timeout.signal.throwIfAborted()
        if (target.names.includes(rule.address) && target.addresses !== null) {
          bindings.set(rule.id, target.addresses)
          continue
        }
        try {
          const binding = await resolveTargetDns(rule.address, this.dnsOptions(), timeout.signal)
          bindings.set(rule.id, binding.addresses.length > 0 && binding.addresses.every(item => isIP(item.address))
            ? binding.addresses.map(item => canonicalTargetHost(item.address)) : null)
        } catch (error) {
          timeout.signal.throwIfAborted()
          if (!(typeof error === 'object' && error !== null && 'code' in error)) throw error
          bindings.set(rule.id, null)
        }
      }
      timeout.signal.throwIfAborted()
      if (store.snapshot().revision !== snapshot.revision) continue
      if (!namedMainland && target.addresses !== null) target.mainland = this.ctx.get('targetCountryData')?.mainland(target.addresses) ?? 'unknown'
      return rules.decide([target], 'unknown', bindings)
    }
    throw new TargetProtectionError('conflict', 'Target settings kept changing during validation; retry after changes settle.')
  }
}
