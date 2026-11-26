/** Native aside identities and their append-only context generations. */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import { sideGeneration } from '@deepseek-ai/dsh-session-query'
export { sideGeneration, sideIdentity } from '@deepseek-ai/dsh-session-query'

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
