/** Native aside identities and their append-only context generations. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'

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

/**
 * Classify a reserved aside against its recorded parent.
 * @param id - Child Session identity.
 * @param parent - Recorded direct parent.
 * @returns Native aside kind, or undefined for ordinary conversations and forks.
 */
export function nativeAsideKind(id: SessionId, parent: SessionId | undefined): 'side' | 'btw' | undefined {
  if (parent === undefined) return undefined
  if (sideGeneration(id, parent) !== undefined) return 'side'
  return /^session-btw-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id) ? 'btw' : undefined
}

/**
 * Read the latest context from durable headers and exact live Sessions, without resuming an Agent.
 * @param ctx - Host query service.
 * @param parent - Owning main conversation.
 * @returns The highest published generation, or undefined before any side was opened.
 */
export async function currentSide(ctx: Context, parent: SessionId): Promise<{ id: SessionId; generation: number } | undefined> {
  return selectCurrentSide((await ctx.sessionQuery.listSessions()).map(entry => entry.header), parent)
}

/**
 * Select the latest published side context from observed Session headers.
 * @param headers - Durable and exact live Session headers.
 * @param parent - Owning main conversation.
 * @returns The highest published generation, or undefined before any side was opened.
 */
export function selectCurrentSide(headers: readonly SessionHeader[], parent: SessionId): { id: SessionId; generation: number } | undefined {
  let current: { id: SessionId; generation: number } | undefined
  for (const header of headers) {
    if (header.parentSession !== parent) continue
    const generation = sideGeneration(header.id, parent)
    if (generation !== undefined && (current === undefined || generation > current.generation)) {
      current = { id: header.id, generation }
    }
  }
  return current
}
