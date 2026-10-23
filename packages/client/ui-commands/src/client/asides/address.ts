/** Address helpers shared by the side-question provider and tab body. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export const ASIDE_PREFIX = 'dsh-resource://aside/session/'

/** @param parent - Main conversation. @returns Stable resource URI for its side question. */
export function asideAddress(parent: SessionId): string { return `${ASIDE_PREFIX}${encodeURIComponent(parent)}` }

/** @param address - Resource URI. @returns Valid source identity, or undefined. */
export function asideParent(address: string): SessionId | undefined {
  if (!address.startsWith(ASIDE_PREFIX)) return undefined
  try {
    const id = decodeURIComponent(address.slice(ASIDE_PREFIX.length))
    return id.length > 0 && id.length <= 256 && !/[/?#\u0000-\u001f]/u.test(id) ? id as SessionId : undefined
  } catch (_invalidEncoding) { return undefined }
}
