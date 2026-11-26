/** Durable identities of native side-conversation generations. */
import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * Derive one parent's canonical side context identity.
 * @param parent - Owning main conversation.
 * @param generation - Zero for the original side, increasing after each clear.
 * @returns The independent side identity; older generations remain historical records.
 */
export function sideIdentity(parent: SessionId, generation = 0): SessionId {
  const base = `session-side-${createHash('sha256').update(parent).digest('hex')}`
  return brandString<SessionId>(generation === 0 ? base : `${base}-${generation}`)
}

/**
 * Recognize only the parent's canonical, bounded context generations.
 * @param id - Candidate native side identity.
 * @param parent - Recorded direct parent.
 * @returns The canonical context generation, or undefined for a different identity.
 */
export function sideGeneration(id: SessionId, parent: SessionId): number | undefined {
  const base = sideIdentity(parent)
  if (id === base) return 0
  if (!id.startsWith(`${base}-`)) return undefined
  const suffix = id.slice(base.length + 1)
  if (!/^[1-9][0-9]*$/u.test(suffix)) return undefined
  const generation = Number(suffix)
  return Number.isSafeInteger(generation) ? generation : undefined
}
