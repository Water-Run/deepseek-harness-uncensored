/** Deterministic local resource decisions after executor-owned path resolution. @module */
import { type LocalPathIdentity } from './file-identity.ts';
import type { TargetDecision, TargetRule } from './types.ts';
/** Local adapter operation; enumeration includes child metadata and watching observes future entries. */
export type LocalTargetOperation = 'metadata' | 'read' | 'list' | 'watch' | 'mutate';
/** Canonical owner-managed path paired with the original rule. */
export interface ResolvedPathRule {
    rule: TargetRule;
    identity: LocalPathIdentity;
}
/**
 * Apply production precedence to canonical paths and hard-link identities.
 * @param target - Freshly resolved executor path.
 * @param operation - Actual provider operation, never a model-supplied effect claim.
 * @param rules - Every enabled local rule with its current link resolution.
 * @returns Denial for full/audit conflicts or unverifiable hard-link aliases, otherwise permission.
 */
export declare function decideLocalTarget(target: LocalPathIdentity, operation: LocalTargetOperation, rules: readonly ResolvedPathRule[]): TargetDecision;
//# sourceMappingURL=file-rules.d.ts.map