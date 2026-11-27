import { readFileSync, writeFileSync } from 'node:fs'

// 1) Cap fork end at the persisted event count without the rc.5 observation field.
const commandsPath = 'packages/api/session-controller/src/commands.ts'
let commands = readFileSync(commandsPath, 'utf8')
const oldCap = '    const endSeq = SessionLogOffset(Math.min(boundary + 1, source.persistedEventCount ?? boundary + 1))'
const newCap = '    const lastSeq = source.events.at(-1)?.seq\n    const persistedEventCount = lastSeq === undefined ? boundary + 1 : Number(lastSeq) + 1\n    const endSeq = SessionLogOffset(Math.min(boundary + 1, persistedEventCount))'
if (!commands.includes(oldCap)) throw new Error('fork cap anchor missing')
commands = commands.replace(oldCap, newCap)
writeFileSync(commandsPath, commands)

// 2) Extend the alpha.2 projection metadata instead of redeclaring it.
const typesPath = 'packages/api/session-controller/src/types.ts'
let types = readFileSync(typesPath, 'utf8')
const start = types.indexOf('/** Persisted hints used to summarize a cold Session. */')
const end = types.indexOf('/**\n * Summary wire values a Session-list row carries.', start)
if (start < 0 || end < 0) throw new Error('metadata block anchors missing')
const replacement = `/** Persisted hints used to summarize a cold Session, extended with DSHU list facts. */
export type SessionListMetadata = BaseSessionListMetadata

declare module '@deepseek-ai/dsh-session-query' {
  interface SessionListMetadata {
    /** Latest completed turn failed; cleared when the next turn starts. Older hints may omit it. */
    readonly lastTurnFailed?: boolean | undefined
    /** Native side generation and its latest own result. The inherited prefix precedes fromSeq. */
    readonly side?: {
      readonly generation: number
      readonly fromSeq: number
      readonly asked: boolean
      readonly result?: { readonly seq: number; readonly interrupted: boolean } | undefined
    } | undefined
  }
}

`
types = types.slice(0, start) + replacement + types.slice(end)
types = types.replace(
  "import type { SessionProjectionMap, SessionProjectionSummaryExcluded, SessionProjectionSummaryValues } from '@deepseek-ai/dsh-session-projection/types'",
  "import type { SessionProjectionMap, SessionProjectionSummaryExcluded, SessionProjectionSummaryValues } from '@deepseek-ai/dsh-session-projection/types'\nimport type { SessionListMetadata as BaseSessionListMetadata } from '@deepseek-ai/dsh-session-query'",
)
writeFileSync(typesPath, types)
console.log('reconciled fork cap and session list metadata')
