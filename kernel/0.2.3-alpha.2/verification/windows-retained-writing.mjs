/** Generate historical writing data with the storage providers in the installed Windows release. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [output, cwd, predictionFile, ...extra] = process.argv.slice(2)
if (process.platform !== 'win32' || !process.versions.electron || extra.length
  || ![output, cwd, predictionFile].every(path => path && isAbsolute(path))) {
  throw new Error('Use the installed Windows Electron with a new output directory, a workspace directory and the prediction sample. All paths must be absolute.')
}
const archive = join(dirname(process.execPath), 'resources', 'app.asar')
const manifest = JSON.parse(await readFile(join(archive, 'package.json'), 'utf8'))
assert.equal(manifest.dshDisplayVersion, '2026.11.24.3')
const packages = join(archive, 'dsh', 'node_modules', '@deepseek-ai')
const bundled = name => import(pathToFileURL(join(packages, name, 'lib', 'index.js')).href)
const { Context } = await bundled('cordis')
const { Session, appendPluginRecord } = await bundled('dsh-session')
const { createAssistantMessage, createMessage, createUserMessage } = await bundled('dsh-llm')
const { default: Storage } = await bundled('dsh-storage')
const storage = await bundled('dsh-storage-json')
const domains = await bundled('dsh-storage-domain')
const jsonl = await bundled('dsh-session-persistence-jsonl')
const { default: WorkspaceRegistry } = await bundled('dsh-workspace')
const { auditEvents } = JSON.parse(await readFile(predictionFile, 'utf8'))
assert.deepEqual(auditEvents.map(event => [event.type, event.data.phase]), [
  ['input/prediction', 'request'], ['input/prediction', 'result'],
])

const parentId = 'retained-print-notebook'
const sideId = 'session-side-' + createHash('sha256').update(parentId).digest('hex')
const route = { provider: 'deepseek-official', model: 'deepseek-flash' }
const noteText = 'Check the spacing on the printed proof and compare the margins of the facing pages. '.repeat(47)
const main = Session.create(parentId)
const side = Session.create(sideId)

function setTitle(session, title) {
  session.append('session/title', { title, messageSeqs: [], source: { kind: 'user' } })
}

function appendTurn(session, turn, prompt, answer, appendHistory) {
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  if (turn === 1) {
    const head = createMessage({ role: 'system', content: [], source: { kind: 'system-prompt', sections: [] } })
    session.append('system/message', { turn, step: 1, message: head }, { surfaceOp: 'append' })
  }
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })
  session.append('user/message', user, { surfaceOp: 'append' })
  appendHistory?.()
  const message = createAssistantMessage({ source: route, content: [{ type: 'text', text: answer }] })
  session.append('assistant/message', { turn, step: 1, stream: [], message }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

setTitle(main, 'Retained print notebook')
const turns = 45
let translatorPairs = 0
let predictions = 0
let annotations = 0
for (let turn = 1; turn <= turns; turn++) {
  appendTurn(main, turn, `Review proof ${turn}`, `Proof ${turn} is ready for the binder.`, () => {
    if (turn === 1) main.append('request/header', { reason: 'initial', header: { config: route } })
    while (translatorPairs < Math.floor(turn * 476 / turns)) {
      translatorPairs++
      for (const phase of ['request', 'result']) {
        appendPluginRecord(main, 'plugin:translator/' + phase, { entry: translatorPairs, text: noteText })
      }
    }
    while (predictions < Math.floor(turn * 109 / turns)) {
      predictions++
      for (const { type, data } of auditEvents) {
        main.append(type, { ...data, revision: predictions, requestId: 'prediction-' + predictions })
      }
    }
    while (annotations < Math.floor(turn * 782 / turns)) {
      annotations++
      appendPluginRecord(main, 'plugin:print-notes/annotation', { entry: annotations, text: noteText })
    }
  })
}
setTitle(side, 'Binder side notes')
appendTurn(side, 1, 'Which paper did we choose?', 'Use cotton paper for the cover.')
assert.equal(main.snapshotEvents().length, 2225)
assert.equal(side.snapshotEvents().length, 8)

await mkdir(output)
await mkdir(cwd, { recursive: true })
const ctx = new Context()
try {
  await ctx.plugin(Storage)
  await ctx.plugin(storage, { root: join(output, 'storages') })
  await ctx.plugin(domains, { backend: 'json' })
  await ctx.plugin(jsonl, { root: join(output, 'sessions'), compression: 'zstd' })
  for (const session of [main, side]) {
    const header = { ...session.header, cwd, agentPreset: 'writing' }
    if (session === side) header.parentSession = parentId
    const writer = await ctx.sessionPersistence.create(header)
    try {
      await writer.append(session.snapshotEvents())
      await writer.flush()
    } finally { await writer.close() }
    const reader = await ctx.sessionPersistence.open(session.id, 'read')
    try {
      const { events } = await reader.read()
      const restored = Session.fromRestore(session.id, events, reader.header, reader.inheritedEventCount, 'detached')
      assert.deepEqual(restored.deriveMessages(), session.deriveMessages())
    } finally { await reader.close() }
  }
  await ctx.plugin(WorkspaceRegistry)
  const workspace = await ctx.workspaceRegistry.create(cwd)
  await workspace.setTitle('Retained print workshop')
  if (!workspace.sessionIds.includes(parentId)) await workspace.attachSession(parentId)
  console.log(JSON.stringify({
    writerVersion: manifest.dshDisplayVersion, mainEvents: main.snapshotEvents().length,
    sideEvents: side.snapshotEvents().length, mainUserMessages: turns, predictions: predictions * 2,
    translatorRecords: translatorPairs * 2, printAnnotations: annotations, parentId, sideId,
  }))
} finally { await ctx.fiber.dispose() }
