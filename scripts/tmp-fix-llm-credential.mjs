import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const show = (path) => execFileSync('git', ['show', `${ours}:${path}`], { encoding: 'utf8' })

// 1) Restore the protocol-level API-key predicate module.
writeFileSync('packages/llm/llm/src/api-key.ts', show('packages/llm/llm/src/api-key.ts'))

// 2) Re-export the DSHU credential guard that adapters call through @deepseek-ai/dsh-llm.
const oursIndex = show('packages/llm/llm/src/index.ts')
const start = oursIndex.indexOf('export function assertUsableApiKey')
if (start < 0) throw new Error('assertUsableApiKey not found in ours')
// The doc comment directly above the function belongs with it.
const docStart = oursIndex.lastIndexOf('/**', start)
const end = oursIndex.indexOf('\n}\n', start) + 3
const block = oursIndex.slice(docStart, end).trimEnd()

const path = 'packages/llm/llm/src/index.ts'
let merged = readFileSync(path, 'utf8')
if (!merged.includes('assertUsableApiKey')) {
  merged = merged.replace(
    "import { deepFreeze } from '@deepseek-ai/dsh-util-values'",
    "import { deepFreeze } from '@deepseek-ai/dsh-util-values'\nimport { normalizeApiKey } from './api-key.ts'\nimport { INVALID_CREDENTIAL_CODE, LlmError } from './error.ts'\nexport * from './api-key.ts'",
  )
  merged = merged.replace('export default LlmRuntime', `${block}\n\nexport default LlmRuntime`)
  writeFileSync(path, merged)
}
console.log('restored api-key.ts and assertUsableApiKey')
