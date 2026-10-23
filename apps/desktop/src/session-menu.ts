/** Validation of the renderer's bounded native-menu roster. */
import type { DesktopSessionItem } from '@deepseek-ai/dsh-api-session-controller/types'

/**
 * Read session labels from the authenticated main renderer.
 * @param value - IPC payload; no paths, URLs, or executable commands are accepted.
 * @returns Validated session identities and labels.
 * @throws When the payload is malformed or exceeds menu limits.
 */
export function parseDesktopSessionItems(value: unknown): readonly DesktopSessionItem[] {
  if (!Array.isArray(value) || value.length > 50) throw new Error('desktop sessions: invalid roster')
  const ids = new Set<string>()
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || !('sessionId' in item) || !('title' in item)
      || typeof item.sessionId !== 'string' || item.sessionId.length === 0 || item.sessionId.length > 128
      || typeof item.title !== 'string' || item.title.length > 200 || ids.has(item.sessionId)) {
      throw new Error('desktop sessions: invalid menu entry')
    }
    ids.add(item.sessionId)
    return { sessionId: item.sessionId as DesktopSessionItem['sessionId'], title: item.title }
  })
}
