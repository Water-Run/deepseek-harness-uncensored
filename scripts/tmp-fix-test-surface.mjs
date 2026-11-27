import { readFileSync, writeFileSync } from 'node:fs'

// Re-apply the projection metadata reconciliation on the restored DSHU types.
const typesPath = 'packages/api/session-controller/src/types.ts'
let types = readFileSync(typesPath, 'utf8')
const start = types.indexOf('/** Persisted hints used to summarize a cold Session. */')
const end = types.indexOf('/**\n * Summary wire values a Session-list row carries.', start)
if (start >= 0 && end > start) {
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
}
if (!types.includes("dsh-session-query")) {
  types = `${types.replace(/^\/\*\*[\s\S]*?\*\/\r?\n/, (head) => `${head}import type { SessionListMetadata as BaseSessionListMetadata } from '@deepseek-ai/dsh-session-query'\n`)}`
}
writeFileSync(typesPath, types)

// Older include-plugin schema usage in the restored e2e tests.
import { execFileSync } from 'node:child_process'
const tests = execFileSync('git', ['grep', '-l', 'entryListSchema', '--', 'apps/web/tests'], { encoding: 'utf8' }).split('\n').filter(Boolean)
for (const file of tests) {
  let text = readFileSync(file, 'utf8')
  text = text.replace(/,? entryListSchema/g, '').replace(/entryListSchema,? /g, '')
  text = text.replace(/yaml\.load\(([^,]+), \{ schema: entryListSchema \}\)/g, 'parseEntryYaml($1)')
  text = text.replace(/\bentryListSchema\b/g, 'parseEntryYaml')
  if (!text.includes('parseEntryYaml')) continue
  text = text.replace(/import \{([^}]*)\} from '@deepseek-ai\/cordis-plugin-include'/, (match, names) => {
    const list = names.split(',').map(item => item.trim()).filter(Boolean)
    if (!list.includes('parseEntryYaml')) list.push('parseEntryYaml')
    return `import { ${list.join(', ')} } from '@deepseek-ai/cordis-plugin-include'`
  })
  writeFileSync(file, text)
  console.log(`adapted ${file}`)
}

// Cordis 0.2.3 exposes the application root through Context.root.
for (const file of ['apps/web/tests/default-product-isolation.e2e.ts']) {
  const text = readFileSync(file, 'utf8').replace(/\.root\b/g, '[Context.root]')
  writeFileSync(file, text)
  console.log(`root access adapted in ${file}`)
}
