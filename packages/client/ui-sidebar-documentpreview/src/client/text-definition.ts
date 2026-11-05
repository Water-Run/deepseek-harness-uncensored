/** Shared metadata for the plain-text fallback. @module */
import type { DocumentPreviewDefinition } from './registry.ts'

/** Stable plain-text implementation identity within this package. */
export const PLAIN_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text'

/**
 * Describe the plain-text fallback.
 * @param title - locale-owned implementation name.
 * @returns plain-text registration metadata.
 */
export function textBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return { id: PLAIN_BODY_ID, extensions: [], priority: 'builtin', title, loading: 'text-pages', wrap: true, sourceLines: true }
}
