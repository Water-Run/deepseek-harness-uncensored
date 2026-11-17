/** Resolve owner-selected remote roots from one retained central rule revision. @module */
import { brandString } from '@deepseek-ai/dsh-brand'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { remotePath, SSH_REMOTE_FILE_RULE_LIMIT } from '@deepseek-ai/dsh-ssh/schemas'
import { z } from 'zod'
import type { TargetRuleId, TargetSnapshot } from './types.ts'

/** Owner-managed association; the SSH endpoint and trusted helper belong to the enclosing connection. */
export interface SshFileMapping {
  /** Stable central resource ID, including a resource with path aliases. */
  ruleId: string
  /** Absolute production path in the verified helper's filesystem. */
  remotePath: string
}

/** Validate config references before any native connection is opened. */
export const sshFileMappings = z.array(z.object({
  ruleId: z.uuid().transform(value => brandString<TargetRuleId>(value)), remotePath,
}).strict()).max(SSH_REMOTE_FILE_RULE_LIMIT)

/**
 * Derive remote levels from central rules rather than a separately supplied protection value.
 * @param snapshot - Rule revision retained by the connection owner.
 * @param mappings - Parsed explicit resource associations.
 * @returns Active path rules, their resource IDs in the same order, and the distinct represented resources.
 * @throws When a reference is missing or has no path selector; disabled and test resources contribute no restriction.
 */
export function resolveSshFileMappings(snapshot: TargetSnapshot, mappings: z.output<typeof sshFileMappings>) {
  const rules: { path: string; protection: 'full' | 'audit' }[] = []
  const resources: TargetRuleId[] = []
  const ids = new Set<TargetRuleId>()
  for (const mapping of mappings) {
    const rule = snapshot.preferences.rules.find(rule => rule.id === mapping.ruleId)
    if (rule === undefined || (rule.match !== 'path' && !rule.aliases?.some(alias => alias.match === 'path'))) {
      throw new HarnessError('An SSH path mapping does not name a central path resource. Check its rule ID.', 'TARGET_IDENTITY_UNVERIFIED')
    }
    if (!rule.enabled || rule.environment !== 'production') continue
    ids.add(rule.id)
    rules.push({ path: mapping.remotePath, protection: rule.protection })
    resources.push(rule.id)
  }
  return { rules, resources, ids: [...ids] }
}
