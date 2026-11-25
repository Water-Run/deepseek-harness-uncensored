/** Compare tool declarations after removal, and optionally probe DeepSeek with synthetic note labels. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--provider')) {
  throw new Error('Run from a prepared DSH source tree with node --import tsx/esm, optionally with --provider.')
}
const { projectToolUpdates } = await import(pathToFileURL(resolve('packages/llm/llm/src/content.ts')).href)
const surrogate = '^[^\\uD800-\\uDFFF]*$'
const nul = '^[^\\x00]*$'
const labelSchemas = {
  control: { type: 'string', minLength: 1, pattern: '^[a-z]+$' },
  combined: { type: 'string', minLength: 1, allOf: [{ pattern: nul }, { pattern: surrogate }] },
  surrogate: { type: 'string', pattern: surrogate },
  nul: { type: 'string', pattern: nul },
  lookahead: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*(?![\\s\\S])' },
  withoutTool: undefined,
}
const name = 'mcp__notes__lookup'
const description = 'Look up a note label.'
const parameters = label => ({ type: 'object', properties: { label } })
const lookup = { name, description, parameters: parameters(labelSchemas.combined) }
const clock = { name: 'clock', description: 'Read the date.', parameters: { type: 'object' } }
const user = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Reply OK.' }] }
const update = (id, type) => ({ id, role: 'developer', source: { kind: 'tool-registry' }, content: [{ type, toolName: name }] })
const added = update('add', 'tool-addition')
const removed = update('remove', 'tool-removal')
console.log(JSON.stringify({ localRegexpAcceptsLabel: new RegExp(surrogate, 'u').test('notes') }))

for (const mode of [undefined, 'addition-only', 'in-history']) {
  for (const disabled of [false, true]) {
    const messages = [{ ...user, id: 'first' }, added]
    const updates = [{ messageId: added.id, additions: [lookup] }]
    if (disabled) {
      messages.push(removed)
      updates.push({ messageId: removed.id, additions: [] })
    }
    messages.push({ ...user, id: 'next' })
    const projected = projectToolUpdates(messages, disabled ? [clock] : [clock, lookup], mode, { tools: [clock], updates })
    console.log(JSON.stringify({ mode: mode ?? 'leading-only', disabled, declaresLookup: projected.tools.some(tool => tool.name === name) }))
  }
}

if (args.includes('--provider')) {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('--provider requires DEEPSEEK_API_KEY for the official DeepSeek endpoint.')
  for (const [sample, label] of Object.entries(labelSchemas)) {
    const response = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-flash', max_tokens: 8, thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: 'Reply OK.' }],
        ...(label && { tools: [{ name, description, input_schema: parameters(label) }] }),
      }),
    })
    const data = await response.json()
    const namedSchemaError = response.status === 400 && data.error?.message?.includes("Invalid schema for function '" + name + "'") === true
    console.log(JSON.stringify({ sample, status: response.status, namedSchemaError }))
    if (!response.ok && (!namedSchemaError || sample === 'control' || sample === 'withoutTool')) {
      throw new Error('The ' + sample + ' request failed without a usable comparison. HTTP ' + response.status)
    }
  }
}
