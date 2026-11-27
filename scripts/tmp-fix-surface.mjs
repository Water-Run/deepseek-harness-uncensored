import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const show = (path) => execFileSync('git', ['show', `${ours}:${path}`], { encoding: 'utf8' })

// 1) Cordis 0.2.3 exposes the application root through the Context.root symbol.
const namespaces = 'packages/mcp/mcp-client/src/namespaces.ts'
let ns = readFileSync(namespaces, 'utf8')
ns = ns.replace("import type { Context } from '@deepseek-ai/cordis'", "import { Context } from '@deepseek-ai/cordis'")
ns = ns.replace('  const root = ctx.root', '  const root = ctx[Context.root]')
writeFileSync(namespaces, ns)

// 2) The alpha.2 runtime validates bindings itself; the helper no longer exists.
const ptc = 'packages/guard/target-protection/src/ptc.ts'
let ptcText = readFileSync(ptc, 'utf8')
ptcText = ptcText.replace(", validatePtcBindings }", ' }')
ptcText = ptcText.replace("    validatePtcBindings(request, 'target-ptc')\n", '')
ptcText = ptcText.replaceAll('return { logs, value }', "return { output: logs.map(log => ({ type: 'text', text: log })), value }")
writeFileSync(ptc, ptcText)

// 3) The alpha.2 SQLite backend imports the JSONL persistence class by name.
const jsonl = 'packages/session/session-persistence-jsonl/src/index.ts'
let jsonlText = readFileSync(jsonl, 'utf8')
jsonlText = jsonlText.replace('class JsonlSessionPersistence extends SessionPersistence', 'export class JsonlSessionPersistence extends SessionPersistence')
writeFileSync(jsonl, jsonlText)

// 4) Keep the DSHU MCP manager, whose lifecycle API matches this fork's client.
execFileSync('git', ['rm', '-r', '-q', '--cached', 'packages/mcp/mcp-manager'], { stdio: 'ignore' })
execFileSync('git', ['checkout', `${ours}`, '--', 'packages/mcp/mcp-manager'])
console.log('applied kernel-surface adaptations')
