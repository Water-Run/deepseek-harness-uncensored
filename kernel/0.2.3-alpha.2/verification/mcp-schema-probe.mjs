/** Compare tool declarations after removal, and optionally probe DeepSeek with synthetic note labels. */
import { dirname, join, resolve } from 'node:path'
import { deepStrictEqual } from 'node:assert'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && !['--provider', '--installed'].includes(args[0]))) {
  throw new Error('Use --provider from a prepared source tree or --installed with the installed Electron executable.')
}
const source = file => import(pathToFileURL(resolve(file)).href)
const installed = args.includes('--installed')
if (installed && !process.versions.electron) throw new Error('--installed requires the desktop executable with ELECTRON_RUN_AS_NODE=1.')
const bundled = name => source(join(dirname(process.execPath), 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', name, 'lib', 'index.js'))
const { projectToolUpdates, createUserMessage, createDeveloperMessage } = installed
  ? await bundled('dsh-llm') : await source('packages/llm/llm/src/index.ts')
const { Session } = installed ? await bundled('dsh-session') : await source('packages/core/session/src/index.ts')
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
    console.log(JSON.stringify({ scenario: 'healthy-control', mode: mode ?? 'leading-only', disabled, declaresLookup: projected.tools.some(tool => tool.name === name) }))
  }
}

async function request(sample, body) {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('--provider requires DEEPSEEK_API_KEY for the official DeepSeek endpoint.')
  const response = await fetch('https://api.deepseek.com/anthropic/v1/messages', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  const namedSchemaError = response.status === 400 && data.error?.message?.includes("Invalid schema for function '" + name + "'") === true
  const text = data.content?.filter(block => block.type === 'text').map(block => block.text).join('')
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
  console.log(JSON.stringify({
    sample, status: response.status, namedSchemaError,
    ...(response.ok && {
      inputTokens: count(data.usage?.input_tokens),
      cacheReadTokens: count(data.usage?.cache_read_input_tokens),
      cacheWriteTokens: count(data.usage?.cache_creation_input_tokens),
    }),
  }))
  if (!response.ok && !namedSchemaError) throw new Error(sample + ' failed. HTTP ' + response.status)
  return { status: response.status, text }
}

const live = args.includes('--provider')
if (live) {
  for (const [sample, label] of Object.entries(labelSchemas)) {
    const { status } = await request(sample, {
      model: 'deepseek-flash', max_tokens: 8, thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'Reply OK.' }],
      ...(label && { tools: [{ name, description, input_schema: parameters(label) }] }),
    })
    if (status !== 200 && (sample === 'control' || sample === 'withoutTool')) throw new Error(sample + ' control failed.')
  }
}

const config = { provider: 'deepseek-official', model: 'deepseek-flash' }
async function sourceSerializer() {
  const { resolveAdapterOptions } = await source('packages/llm/llm-deepseek/src/config.ts')
  const { serialize } = await source('packages/llm/llm-deepseek/src/serialize.ts')
  const connection = resolveAdapterOptions({})
  return projected => {
    const input = { ...config, ...projected, maxTokens: 32, reasoningEffort: 'off' }
    return { ...serialize(input, connection, projected.messages, new Map(), () => undefined), stream: false }
  }
}
const serializeRequest = installed ? undefined : await sourceSerializer()
function wire(session, tools, mode) {
  const projected = projectToolUpdates(session.deriveMessages(), tools, mode, session.toolHistory())
  return serializeRequest ? serializeRequest(projected) : projected
}
function input(session, text) {
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
}
const session = Session.create('mcp-schema-probe')
session.append('turn/start', { turn: 1 })
session.append('step/start', { turn: 1, step: 1 })
session.append('request/header', { reason: 'initial', header: { config, tools: [clock, lookup] } })
input(session, 'The notebook label is ORCHID. Remember it.')
const original = wire(session, [clock, lookup], 'in-history')
if (!original.tools.some(tool => tool.name === name)) throw new Error('The original request is missing the diagnostic tool.')
if (live && (await request('original-session', original)).status !== 400) {
  throw new Error('The endpoint accepted the diagnostic schema. Reassess the recovery fixture.')
}
session.append('step/end', { turn: 1, step: 1 })
session.append('turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'INVALID_REQUEST', status: 400, message: 'Invalid tool schema' } } })
const restored = Session.fromRestore(session.id, session.snapshotEvents(), session.header, 0, 'shared-frozen')
restored.append('turn/start', { turn: 2 })
restored.append('step/start', { turn: 2, step: 1 })
restored.append('request/header', { reason: 'resume', header: { config, tools: [clock] } })
restored.append('developer/message', { turn: 2, step: 1, message: createDeveloperMessage({
  source: { kind: 'tool-registry' }, content: [{ type: 'tool-removal', toolName: name }],
}) }, { surfaceOp: 'append' })
input(restored, 'Reply only with the notebook label from my earlier message.')
for (const mode of [undefined, 'addition-only', 'in-history']) {
  const body = wire(restored, [clock], mode)
  if (JSON.stringify(body).includes(name) || !body.tools?.some(tool => tool.name === 'clock')) {
    throw new Error('Recovery advertised the disabled tool or lost the clock on ' + (mode ?? 'leading-only'))
  }
  if (!JSON.stringify(body.messages).includes('ORCHID')) throw new Error('Recovery lost the original notebook label.')
  console.log(JSON.stringify({ session: restored.id, installed, recoveryMode: mode ?? 'leading-only', tools: body.tools.map(tool => tool.name) }))
  if (live && mode === 'in-history') {
    const answer = await request('restored-session', body)
    if (answer.status !== 200 || !answer.text?.includes('ORCHID')) throw new Error('Recovered reply did not recall the label.')
  }
}

const list = { ...clock, name: 'mcp__notes__list', description: 'List note labels.' }
const named = Session.create('mcp-schema-named-rejection')
named.append('turn/start', { turn: 1 })
named.append('step/start', { turn: 1, step: 1 })
named.append('request/header', { reason: 'initial', header: { config, tools: [clock, list, lookup] } })
input(named, 'Keep my note.')
const initialTools = wire(named, [clock, list, lookup], 'in-history').tools
function removeTools(session, turn, tools, removedName) {
  session.append('request/header', { reason: 'resume', header: { config, tools } })
  session.append('developer/message', { turn, step: 1, message: createDeveloperMessage({
    source: { kind: 'tool-registry' }, content: [{ type: 'tool-removal', toolName: removedName }],
  }) }, { surfaceOp: 'append' })
}
removeTools(named, 1, [clock, lookup], list.name)
named.append('step/end', { turn: 1, step: 1 })
named.append('turn/end', { turn: 1, reason: { kind: 'error', error: {
  code: 'INVALID_REQUEST', status: 400, message: `Invalid schema for function '${name}': invalid pattern`,
} } })
const reopened = Session.fromRestore(named.id, named.snapshotEvents(), named.header, 0, 'shared-frozen')
reopened.append('turn/start', { turn: 2 })
reopened.append('step/start', { turn: 2, step: 1 })
removeTools(reopened, 2, [clock], name)
input(reopened, 'Continue.')
const recovered = wire(reopened, [clock], 'in-history')
deepStrictEqual(recovered.tools, initialTools.filter(tool => tool.name !== name))
const history = JSON.stringify(recovered.messages)
if (!history.includes(list.name) || history.includes(name) || !history.includes('Keep my note.')) {
  throw new Error('Named-schema recovery changed unrelated tool history or user text.')
}
console.log(JSON.stringify({ scenario: 'named-rejection', runtime: installed ? 'installed' : 'source', retained: recovered.tools.map(tool => tool.name) }))
