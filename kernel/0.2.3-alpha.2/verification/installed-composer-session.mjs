/** Exercise the JSONL provider bundled in each desktop installation in an isolated upgrade fixture. */
import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [phase, directory, sample, compression = 'zstd', ...extra] = process.argv.slice(2)
const linuxNode = '/resources/runtime/primary-runtime/dependencies/node/bin/node'
const standalone = process.platform === 'linux' && process.execPath.endsWith(linuxNode)
if ((!standalone && !process.versions.electron) || !['write', 'continue', 'reopen'].includes(phase) || !directory || !sample
  || !['none', 'zstd'].includes(compression) || extra.length) {
  throw new Error('Use the packaged Linux Node or the installed desktop Electron with write|continue|reopen, a fixture directory, the prediction sample and optional released compression (none|zstd).')
}
const archive = standalone
  ? join(process.execPath.slice(0, -linuxNode.length), 'resources', 'app.asar.unpacked')
  : join(dirname(process.execPath), 'resources', 'app.asar')
const packages = join(archive, 'dsh', 'node_modules')
const bundled = name => import(pathToFileURL(join(packages, name, 'lib', 'index.js')).href)
const { Context } = await bundled('@deepseek-ai/cordis')
const { Session } = await bundled('@deepseek-ai/dsh-session')
const { createUserMessage } = await bundled('@deepseek-ai/dsh-llm')
const jsonl = await bundled('@deepseek-ai/dsh-session-persistence-jsonl')
const id = 'composer-upgrade'
const first = 'Save the word ORCHID.'
const next = 'Use the word in a poem.'
const receipt = join(directory, 'prediction-events.json')
const userMessage = text => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] })
const predictions = events => events.filter(event => event.type === 'input/prediction')
if (phase === 'write') await mkdir(directory)
const ctx = new Context()
try {
  const root = join(directory, 'sessions')
  await ctx.plugin(jsonl, { root, compression })
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
    const files = (await readdir(root, { recursive: true })).filter(path => /(?:^|[/\\])session\.v4\.jsonl(?:\.zstd)?$/u.test(path))
    assert.equal(files.length, 1)
    const bytes = await readFile(join(root, files[0]))
    if (compression === 'zstd') {
      assert(files[0].endsWith('.jsonl.zstd'))
      assert.equal(bytes.subarray(0, 4).toString('hex'), '28b52ffd')
    } else {
      assert(files[0].endsWith('.jsonl'))
      assert.equal(JSON.parse(bytes.toString('utf8').split('\n')[0]).version, 4)
    }
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
