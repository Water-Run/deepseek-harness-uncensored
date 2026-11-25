/** Check the offline desktop writing-memory exercise against its stored record and session logs. */
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const [profile, initialReceipt, coldReceipt] = process.argv.slice(2)
if (!profile || !initialReceipt || !coldReceipt) {
  throw new Error('Pass the post-restart fixture profile, then the initial and cold provider.jsonl files.')
}
const fixtureTitle = 'North Quay lantern'
const fact = glass => 'The North Quay lantern uses ' + glass + ' glass.'
const storage = JSON.parse(await readFile(join(profile, 'storages', 'memory.json'), 'utf8'))
const matches = Object.values(storage.tables.memories).filter(row => row.title === fixtureTitle)
assert.equal(matches.length, 1, 'Expected one extracted fixture record')
const [record] = matches
assert.equal(record.type, 'writing-setting')
assert.equal(record.content, fact('COBALT-28'))
assert.equal(record.version, 2)
assert.equal(record.status, 'enabled')
assert.equal(record.scope.mode, 'writing')
assert.equal(record.scope.global, false)
assert.ok(record.scope.workspace)
assert.equal(record.source.kind, 'assistant')

const root = join(profile, 'sessions')
const files = (await readdir(root, { recursive: true })).filter(path => /(?:^|[/\\])session\.v4\.jsonl(?:\.zstd)?$/u.test(path))
const turns = new Map()
let source
for (const file of files) {
  const bytes = await readFile(join(root, file))
  const jsonl = file.endsWith('.zstd') ? zstdDecompressSync(bytes) : bytes
  const [header, ...events] = jsonl.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line))
  if (header.id === record.source.sessionId) source = { header, events }
  let mode = header.agentPreset
  let start = 0
  for (const [index, event] of events.entries()) {
    if (event.type === 'agent-preset/selected') mode = event.data.agentPreset
    if (event.type === 'turn/start') start = index
    if (event.type !== 'turn/end') continue
    const turn = events.slice(start, index + 1)
    const user = turn.find(({ type, data }) => type === 'user/message' && data.source.kind === 'user')
    const prompt = user?.data.content.find(block => block.type === 'text')?.text
    const label = prompt?.match(/^(STORE-QUAY|QUERY-QUAY-(?:ONE|TWO|OFF|COLD|OTHER))\b/u)?.[0]
    if (!label) continue
    assert.ok(!turns.has(label), 'Repeated turn ' + label)
    assert.equal(event.data.reason.kind, 'completed', label)
    turns.set(label, { header, mode, turn })
  }
}
assert.ok(source, 'Missing originating session')
const revisions = version => [{ id: record.id, version }]
const extractions = source.events.filter(event => event.type === 'memory/extraction').map(event => event.data)
const results = extractions.filter(event => event.phase === 'result' && event.saved?.some(row => row.id === record.id))
assert.equal(results.length, 1, 'Expected one successful extraction of the original record')
const [result] = results
assert.equal(result.outcome, 'completed')
assert.deepEqual(result.saved, revisions(1))
const request = extractions.find(event => event.phase === 'request' && event.requestId === result.requestId)
assert.deepEqual(request?.scope, record.scope)

const cases = [
  ['STORE-QUAY', 'writing', 0, 'The writing note is ready.'],
  ['QUERY-QUAY-ONE', 'writing', 1, 'QUERY-QUAY-ONE BRAMBLE-71'],
  ['QUERY-QUAY-TWO', 'writing', 2, 'QUERY-QUAY-TWO COBALT-28'],
  ['QUERY-QUAY-OFF', 'writing', 0, 'QUERY-QUAY-OFF NO MATCH'],
  ['QUERY-QUAY-COLD', 'writing', 2, 'QUERY-QUAY-COLD COBALT-28'],
  ['QUERY-QUAY-OTHER', 'standard', 0, 'QUERY-QUAY-OTHER NO MATCH'],
]
for (const [label, mode, version, answer] of cases) {
  const actual = turns.get(label)
  assert.ok(actual, 'Missing turn ' + label)
  assert.equal(actual.mode, mode, label)
  assert.equal(actual.header.cwd, source.header.cwd, label)
  const messages = actual.turn.filter(event => event.type === 'user/message' && event.data.source.kind === 'memory-context')
  assert.equal(messages.length, version ? 1 : 0, label + ' memory messages')
  if (version) {
    const { source: context, content } = messages[0].data
    assert.deepEqual(context.entries, revisions(version), label)
    const text = content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    assert.ok(text.includes(fact(version === 1 ? 'BRAMBLE-71' : 'COBALT-28')), label + ' injected content')
  }
  const responses = actual.turn.filter(event => event.type === 'assistant/message')
  assert.deepEqual(responses.flatMap(event => event.data.message.content).map(block => block.text), [answer], label)
}
const id = label => turns.get(label).header.id
assert.equal(id('STORE-QUAY'), source.header.id)
assert.equal(id('QUERY-QUAY-ONE'), id('QUERY-QUAY-TWO'))
assert.equal(new Set(cases.map(([label]) => id(label))).size, 5, 'Expected five distinct conversations')

async function receipts(file) {
  return (await readFile(file, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line))
}
const initial = await receipts(initialReceipt)
const cold = await receipts(coldReceipt)
assert.deepEqual(initial.filter(row => row.kind === 'extract').map(row => row.count), [1])
assert.ok(!cold.some(row => row.kind === 'extract'), 'Automatic extraction ran after restart')
for (const [scenario, , version] of cases.slice(1)) {
  const phase = ['QUERY-QUAY-COLD', 'QUERY-QUAY-OTHER'].includes(scenario) ? cold : initial
  const requests = phase.filter(row => row.kind === 'turn' && row.scenario === scenario)
  assert.ok(requests.length, 'Missing HTTP request for ' + scenario)
  if (version) {
    const active = requests.filter(row => row.hasMemoryTools)
    assert.ok(active.length > 0, 'Missing interactive request for ' + scenario)
    assert.ok(active.every(row => version === 1 ? row.old && !row.updated : row.updated), scenario)
    if (scenario === 'QUERY-QUAY-COLD') assert.ok(requests.every(row => !row.old), scenario)
  } else {
    assert.ok(requests.every(row => !row.old && !row.updated), scenario + ' received out-of-scope content')
    if (scenario === 'QUERY-QUAY-OFF') assert.ok(requests.every(row => !row.hasMemoryTools), scenario)
  }
}
console.log(JSON.stringify({ record: record.id, workspace: record.scope.workspace, sessions: 5, turns: cases.length, revision: record.version }))
