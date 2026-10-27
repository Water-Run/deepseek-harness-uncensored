/** Deterministic local resource decisions after executor-owned path resolution. @module */
import { localPathContains, type LocalPathIdentity } from './file-identity.ts'
import type { TargetDecision, TargetRule } from './types.ts'

/** Local adapter operation; enumeration includes child metadata and watching observes future entries. */
export type LocalTargetOperation = 'metadata' | 'read' | 'list' | 'watch' | 'mutate'

/** Canonical owner-managed path paired with the original rule. */
export interface ResolvedPathRule { rule: TargetRule; identity: LocalPathIdentity }

function ids(entries: readonly ResolvedPathRule[]) { return [...new Set(entries.map(entry => entry.rule.id))] }

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
  if (full.length > 0) return { allowed: false, code: 'TARGET_FULLY_PROTECTED', ruleIds: ids(full) }
  const audits = production.filter(entry => entry.rule.protection === 'audit')
  if (audits.length > 0 && operation === 'mutate') return { allowed: false, code: 'TARGET_READ_ONLY', ruleIds: ids(audits) }
  // A hard link outside a protected directory cannot be attributed without indexing that directory.
  const unresolved = rules.filter(entry => entry.rule.environment === 'production' && entry.identity.directory && !matches(entry))
  if (target.multipleLinks && unresolved.length > 0) {
    return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: ids(unresolved) }
  }
  const unknownFiles = rules.filter(entry => entry.rule.environment === 'production' && !matches(entry)
    && !entry.identity.directory && entry.identity.exists && target.exists && !target.directory
    && (target.fileId === undefined || entry.identity.fileId === undefined))
  if (unknownFiles.length > 0) return { allowed: false, code: 'TARGET_IDENTITY_UNVERIFIED', ruleIds: ids(unknownFiles) }
  return { allowed: true, ruleIds: ids(rules.filter(matches)) }
}
