/** Deterministic local resource decisions after executor-owned path resolution. @module */
import { localPathContains, type LocalPathIdentity } from './file-identity.ts'
import type { TargetDecision, TargetRule } from './types.ts'

/** Local adapter operation; enumeration includes child metadata and watching observes future entries. */
export type LocalTargetOperation = 'metadata' | 'read' | 'list' | 'watch' | 'mutate'

/** Canonical owner-managed path paired with the original rule. */
export interface ResolvedPathRule { rule: TargetRule; identity: LocalPathIdentity }

/**
 * Apply production precedence to canonical paths and hard-link identities.
 * @param target - Freshly resolved executor path.
 * @param operation - Actual provider operation, never a model-supplied effect claim.
 * @param rules - Every enabled local rule with its current link resolution.
 * @returns Denial for full/audit conflicts or unverifiable hard-link aliases, otherwise permission.
 */
export function decideLocalTarget(
  target: LocalPathIdentity, operation: LocalTargetOperation, rules: readonly ResolvedPathRule[],
): TargetDecision {
  const enumeration = operation === 'list' || operation === 'watch'
  const matches = ({ identity }: ResolvedPathRule): boolean => {
    const sameFile = target.fileId !== undefined && target.fileId === identity.fileId
    return sameFile || [identity.path, identity.canonical].some(root => [target.path, target.canonical].some(path =>
      localPathContains(root, path) || ((enumeration || operation === 'mutate') && localPathContains(path, root))))
  }
  const production = rules.filter(entry => entry.rule.environment === 'production' && matches(entry))
  const full = production.filter(entry => entry.rule.protection === 'full')
  if (full.length > 0) return { allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: full.map(entry => entry.rule.id) }
  const audits = production.filter(entry => entry.rule.protection === 'audit')
  if (audits.length > 0 && operation === 'mutate') return { allowed: false, code: 'TARGET_READ_ONLY', ruleIds: audits.map(entry => entry.rule.id) }
  // A hard link outside a protected directory cannot be attributed without indexing that directory.
  const unresolved = rules.filter(entry => entry.rule.environment === 'production' && entry.identity.directory && !matches(entry))
  if (target.multipleLinks && unresolved.length > 0) {
    return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: unresolved.map(entry => entry.rule.id) }
  }
  return { allowed: true, ruleIds: rules.filter(matches).map(entry => entry.rule.id) }
}
