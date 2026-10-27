/** Missing filesystem identity is not evidence that a file is unrelated to production. @module */
import { resolve } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import { expect, it } from 'vitest'
import { decideLocalTarget } from '../src/file-rules.ts'
import type { LocalPathIdentity } from '../src/file-identity.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'

const rule: TargetRule = { id: brandString<TargetRuleId>('237a9e55-1b8e-477a-b13e-fb9685b9a0d1'),
  name: 'production', enabled: true, kind: 'database', environment: 'production', protection: 'full',
  match: 'path', address: resolve('production.sqlite') }
function identity(path: string, extra: Partial<LocalPathIdentity> = {}): LocalPathIdentity {
  return { path, canonical: path, exists: true, directory: false, multipleLinks: false, ...extra }
}

it('refuses an existing file whose relationship to a protected file cannot be established', () => {
  const production = identity(rule.address, { fileId: 'volume:10000000000000001' })
  const candidate = identity(resolve('candidate.sqlite'))
  expect(decideLocalTarget(candidate, 'read', [{ rule, identity: production }]))
    .toMatchObject({ allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED' })
  expect(decideLocalTarget(identity(candidate.path, { fileId: 'volume:10000000000000002' }), 'read', [{ rule, identity: production }]).allowed)
    .toBe(true)
})

it('does not confuse a prospective file with an existing file of unknown identity', () => {
  const production = identity(rule.address)
  const prospective = identity(resolve('new.sqlite'), { exists: false })
  expect(decideLocalTarget(prospective, 'mutate', [{ rule, identity: production }]).allowed).toBe(true)
  expect(decideLocalTarget(identity(rule.address), 'read', [{ rule, identity: production }]))
    .toMatchObject({ allowed: false, code: 'TARGET_FULLY_PROTECTED' })
})
