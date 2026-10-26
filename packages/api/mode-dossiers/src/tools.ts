/** Built-in reverse case and sample capabilities; REA owns external engine diagnostics. @module */

import type { ToolStatus } from './types.ts'

/** Capabilities this build actually performs, with no external connector. */
const BUILT_IN: readonly ToolStatus[] = [
  {
    id: 'case-ledger',
    name: 'Case ledger (.reverse/<slug>/case.json)',
    kind: 'builtin',
    available: true,
    detail: 'Targets, evidence, findings and notes are read and written here and by casefile.mjs.',
  },
  {
    id: 'sample-inventory',
    name: 'Sample inventory (hash, format, entropy, strings)',
    kind: 'builtin',
    available: true,
    detail: 'Reads sample bytes only; it never executes or loads the sample.',
  },
  {
    id: 'report',
    name: 'Case report rendering',
    kind: 'builtin',
    available: true,
    detail: 'Renders the same Markdown report casefile.mjs prints.',
  },
]

/**
 * Report every reverse-engineering capability this Host can actually reach.
 * @returns Built-in case and inventory capabilities; external connections have their own live status.
 */
export function toolStatuses(): ToolStatus[] {
  return [...BUILT_IN]
}
