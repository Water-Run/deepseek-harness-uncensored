/**
 * Honest reverse-engineering tool status.
 *
 * The Reverse mode ships workflows and a read-only inventory, not a
 * decompiler. Connector rows therefore report `available: false` with the
 * reason this Host has no bridge, instead of advertising a tool the request
 * cannot use. Nothing here probes, downloads, or installs software.
 */

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

/** Bridges the playbooks name but this build does not connect. */
const NOT_CONNECTED: readonly ToolStatus[] = [
  {
    id: 'ida-pro-mcp',
    name: 'IDA Pro (MCP bridge)',
    kind: 'external',
    available: false,
    detail: 'No IDA Pro connector is configured for this Host, so disassembly is done outside the app.',
  },
  {
    id: 'ghidra-mcp',
    name: 'Ghidra (GhidraMCP)',
    kind: 'external',
    available: false,
    detail: 'No Ghidra connector is configured for this Host.',
  },
  {
    id: 'rea',
    name: 'REA bridge (Ghidra, IDA, Hopper, mobile)',
    kind: 'external',
    available: false,
    detail: 'The REA bridge is not installed or connected in this build.',
  },
  {
    id: 'frida',
    name: 'Frida runtime',
    kind: 'external',
    available: false,
    detail: 'Dynamic instrumentation runs only when the Host has Frida available; this build connects none.',
  },
]

/**
 * Report every reverse-engineering capability this Host can actually reach.
 * @returns built-in capabilities first, then unconnected external bridges.
 */
export function toolStatuses(): ToolStatus[] {
  return [...BUILT_IN, ...NOT_CONNECTED]
}
