/** Exercise the JSONL provider bundled in each desktop installation in an isolated upgrade fixture. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [phase, directory, sample, ...extra] = process.argv.slice(2)
if (!process.versions.electron || !['write', 'continue', 'reopen'].includes(phase) || !directory || !sample || extra.length) {
  throw new Error('Use the installed desktop Electron executable with write|continue|reopen, a fixture directory and the prediction sample.')
}
const packages = join(dirname(process.execPath), 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai')
const bundled = name => import(pathToFileURL(join(packages, name, 'lib', 'index.js')).href)
const { Context } = await bundled('cordis')
const { Session } = await bundled('dsh-session')
const { createUserMessage } = await bundled('dsh-llm')
const jsonl = await bundled('dsh-session-persistence-jsonl')
const id = 'composer-upgrade'
const first = 'Save the word ORCHID.'
const next = 'Use the word in a poem.'
const receipt = join(directory, 'prediction-events.json')
const userMessage = text => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const predictions = events => events.filter(event => event.type === 'input/prediction')
if (phase === 'write') await mkdir(directory)
const ctx = new Context()
try {
  await ctx.plugin(jsonl, { root: join(directory, 'sessions'), compression: 'zstd' })
  if (phase === 'write') {
    const { auditEvents } = JSON.parse(await readFile(sample, 'utf8'))
    assert.deepEqual(auditEvents.map(event => [event.type, event.data.phase]), [
      ['input/prediction', 'request'], ['input/prediction', 'result'],
    ])
    const session = Session.create(id)
    session.append('turn/start', { turn: 1 })
    session.append('user/message', userMessage(first), { surfaceOp: 'append' })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    for (const event of auditEvents) session.append(event.type, event.data)
    const events = session.snapshotEvents()
    const handle = await ctx.sessionPersistence.create(session.header)
    try {
      await handle.append(events)
      await handle.flush()
    } finally { await handle.close() }
    await writeFile(receipt, JSON.stringify(predictions(events)), { flag: 'wx' })
  } else {
    const handle = await ctx.sessionPersistence.open(id, phase === 'continue' ? 'write' : 'read')
    try {
      assert.equal(handle.header.version, 4)
      const { events } = await handle.read()
      assert.deepEqual(predictions(events), JSON.parse(await readFile(receipt, 'utf8')))
      const session = Session.fromRestore(id, events, handle.header, handle.inheritedEventCount, 'detached')
      const texts = phase === 'continue' ? [first] : [first, next]
      assert.deepEqual(session.deriveMessages().map(message => message.content), texts.map(text => [{ type: 'text', text }]))
      if (phase === 'continue') {
        session.append('turn/start', { turn: 2 })
        session.append('user/message', userMessage(next), { surfaceOp: 'append' })
        session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
        await handle.append(session.snapshotEvents().slice(events.length))
        await handle.flush()
      }
    } finally { await handle.close() }
  }
} finally { await ctx.fiber.dispose() }
console.log('composer-upgrade ' + phase)
