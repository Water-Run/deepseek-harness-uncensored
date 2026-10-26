/** Canonical target identities and production precedence, independent of model text. @module */
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { canonicalTargetHost, parseTargetPreferences, TargetRules } from '../src/rules.ts'
import type { NetworkTarget, TargetRule, TargetRuleId } from '../src/types.ts'

function rule(overrides: Partial<TargetRule> = {}): TargetRule {
  return { id: brandString<TargetRuleId>(randomUUID()), name: 'production', enabled: true, kind: 'server',
    environment: 'production', protection: 'full', match: 'host', address: '192.0.2.10', ...overrides }
}
function target(overrides: Partial<NetworkTarget> = {}): NetworkTarget {
  return { names: ['192.0.2.10'], nameResolution: 'verified', addresses: ['192.0.2.10'], port: 443, mainland: 'no', ...overrides }
}
function policy(rules: TargetRule[], mainlandEnabled = false): TargetRules { return new TargetRules({ mainlandEnabled, rules }) }

it.each([
  ['Example.COM.', 'example.com'], ['例子.中国', 'xn--fsqu00a.xn--fiqs8s'],
  ['[::ffff:192.0.2.10]', '192.0.2.10'], ['0x7f000001', '127.0.0.1'], ['127.1', '127.0.0.1'],
])('normalizes %s to %s', (input, expected) => { expect(canonicalTargetHost(input)).toBe(expected) })

it.each(['user:password@prod.test', 'https://prod.test/path', 'prod.test:443', 'prod.test?secret=value', 'a..test', 'fe80::1%eth0'])(
  'rejects an ambiguous or credential-bearing host field %s', (value) => { expect(() => canonicalTargetHost(value)).toThrow() },
)

it('full protection wins over an audit rule and a test exception regardless of their order', () => {
  const full = rule(), audit = rule({ protection: 'audit' }), test = rule({ environment: 'test' })
  expect(policy([test, audit, full]).decide([target()], 'unknown', new Map()))
    .toEqual({ allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: [full.id] })
  expect(policy([full]).decide([target()], 'observe', new Map()).allowed).toBe(false)
})

it('audit permission requires an executor-guaranteed observation', () => {
  const audit = policy([rule({ protection: 'audit' })])
  expect(audit.decide([target()], 'observe', new Map()).allowed).toBe(true)
  for (const effect of ['unknown', 'mutate', 'unconfined'] as const) {
    expect(audit.decide([target()], effect, new Map())).toMatchObject({ allowed: false, code: 'TARGET_READ_ONLY' })
  }
})

it('a test database does not exempt another database or an unresolved database identity', () => {
  const production = rule({ kind: 'database', database: 'production' })
  const test = rule({ kind: 'database', database: 'test', environment: 'test' })
  const rules = policy([production, test], true)
  expect(rules.decide([target({ database: 'test', mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(true)
  expect(rules.decide([target()], 'mutate', new Map())).toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED' })
  expect(rules.decide([target({ database: 'production' })], 'observe', new Map()).allowed).toBe(false)
  expect(rules.decide([target({ database: 'test', port: 80, mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(true)
})

it('a port-limited test exception is not an exemption for unknown or different ports', () => {
  const rules = policy([rule({ environment: 'test', port: 443 })], true)
  const missingPort = { names: ['192.0.2.10'], nameResolution: 'verified' as const, addresses: ['192.0.2.10'], mainland: 'yes' as const }
  expect(rules.decide([missingPort], 'mutate', new Map()).allowed).toBe(false)
  expect(rules.decide([target({ port: 80, mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(false)
  expect(rules.decide([target({ mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(true)
})

it('matches resolved address aliases and refuses an unresolved protected hostname', () => {
  const production = rule({ address: 'prod.test' })
  const rules = policy([production])
  expect(rules.decide([target({ names: ['alias.test'] })], 'observe', new Map([[production.id, ['192.0.2.10']]])))
    .toMatchObject({ allowed: false, code: 'TARGET_FULLY_PROTECTED' })
  expect(rules.decide([target({ names: ['unrelated.test'], addresses: ['192.0.2.20'] })], 'observe', new Map([[production.id, null]])))
    .toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED' })
})

it('uses domain label boundaries and rejects unverified direct IP access under a named rule', () => {
  const rules = policy([rule({ match: 'domain', address: 'prod.test' })])
  expect(rules.decide([target({ names: ['child.prod.test'] })], 'mutate', new Map()).allowed).toBe(false)
  expect(rules.decide([target({ names: ['notprod.test'] })], 'mutate', new Map()).allowed).toBe(true)
  expect(rules.decide([target({ names: ['alias.test'], nameResolution: 'unknown' })], 'mutate', new Map()))
    .toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED' })
  expect(rules.decide([target()], 'mutate', new Map())).toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED' })
})

it('supports linear-time host regexes and equivalent IPv4-mapped networks', () => {
  const regex = policy([rule({ match: 'regex', address: '^db[0-9]+\\.internal$' })])
  expect(regex.decide([target({ names: ['db123.internal'] })], 'observe', new Map()).allowed).toBe(false)
  expect(regex.decide([target({ names: ['web.internal'] })], 'observe', new Map()).allowed).toBe(true)
  const mapped = policy([rule({ match: 'cidr', address: '::ffff:192.0.2.0/120' })])
  expect(mapped.decide([target()], 'observe', new Map()).allowed).toBe(false)
  expect(() => policy([rule({ match: 'regex', address: '(?=unsupported)' })])).toThrow()
  expect(policy([rule({ match: 'regex', address: '^127' })])
    .decide([target({ names: ['0x7f000001'], addresses: ['192.0.2.20'] })], 'observe', new Map()).allowed).toBe(true)
  expect(policy([rule({ match: 'regex', address: '^$' })])
    .decide([target({ names: ['safe.test'], addresses: ['2001:db8::10'] })], 'observe', new Map()).allowed).toBe(true)
})

it('checks every target and never lets one test exception exempt the rest', () => {
  const rules = policy([rule({ environment: 'test' })], true)
  expect(rules.decide([target({ mainland: 'yes' }), target({ names: ['192.0.2.11'], addresses: ['192.0.2.11'], mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(false)
})

it('does not let one test IP exempt other possible DNS connection addresses', () => {
  const rules = policy([rule({ environment: 'test' })], true)
  expect(rules.decide([target({ names: ['multi.test'], addresses: ['192.0.2.10', '192.0.2.11'], mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(false)
  const both = policy([rule({ environment: 'test' }), rule({ environment: 'test', address: '192.0.2.11' })], true)
  expect(both.decide([target({ names: ['multi.test'], addresses: ['192.0.2.10', '192.0.2.11'], mainland: 'yes' })], 'mutate', new Map()).allowed).toBe(true)
})

it('requires region and transport evidence while automatic protection is active', () => {
  const rules = policy([], true)
  expect(rules.decide([target({ mainland: 'unknown' })], 'observe', new Map()).allowed).toBe(false)
  expect(rules.decide([target({ addresses: null })], 'observe', new Map()).allowed).toBe(false)
  expect(rules.decide([target({ mainland: 'yes' })], 'observe', new Map()).allowed).toBe(true)
  expect(rules.decide([target({ mainland: 'yes' })], 'unknown', new Map()).allowed).toBe(false)
  expect(rules.decide([target()], 'unknown', new Map()).allowed).toBe(true)
})

it('does not treat a test label alone as enabling protection and does not share compiled rule objects', () => {
  const input = rule({ address: 'prod.test' })
  const rules = policy([input])
  input.environment = 'test'
  const exposed = rules.namedHosts()[0]
  if (exposed === undefined) throw new Error('Missing expected rule')
  exposed.environment = 'test'
  expect(rules.preflight(target({ names: ['prod.test'] }))?.allowed).toBe(false)
  expect(policy([rule({ environment: 'test' })]).decide([], 'unknown', new Map()).allowed).toBe(true)
})

it('rejects duplicate IDs, malformed CIDRs and broad test exceptions before saving', () => {
  const existing = rule()
  for (const rules of [[existing, existing], [rule({ match: 'cidr', address: 'bad/99' })], [rule({ match: 'regex', address: '.*', environment: 'test' })]]) {
    expect(() => parseTargetPreferences({ mainlandEnabled: true, rules })).toThrow()
  }
})
