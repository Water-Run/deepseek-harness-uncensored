import { readFileSync, writeFileSync } from 'node:fs'

const typesPath = 'packages/api/session-controller/src/types.ts'
let types = readFileSync(typesPath, 'utf8')
const start = types.indexOf('/** Persisted hints used to summarize a cold Session. */')
const end = types.indexOf('/**\n * Summary wire values a Session-list row carries.', start)
if (start < 0 || end < 0) throw new Error('metadata block not found')
const block = `/** Persisted hints used to summarize a cold Session, extended with DSHU list facts. */
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
types = types.slice(0, start) + block + types.slice(end)
if (!types.includes("import type { SessionListMetadata as BaseSessionListMetadata }")) {
  const firstImport = types.indexOf('import ')
  types = `${types.slice(0, firstImport)}import type { SessionListMetadata as BaseSessionListMetadata } from '@deepseek-ai/dsh-session-query'\n${types.slice(firstImport)}`
}
writeFileSync(typesPath, types)
console.log('metadata reconciliation applied')
