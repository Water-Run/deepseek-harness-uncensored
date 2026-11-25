/** Write or verify the synthetic balance history used in desktop upgrade checks. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [mode, storageRoot, sampleFile, ...extra] = process.argv.slice(2)
if (!process.versions.electron || extra.length || !['seed', 'local', 'age', 'off'].includes(mode)
  || ![storageRoot, sampleFile].every(path => path && isAbsolute(path))) {
  throw new Error('Use the installed Windows Electron in Node mode with seed|local|age|off, an absolute storage directory and an absolute sample-file path.')
}

const archive = join(dirname(process.execPath), 'resources', 'app.asar')
const { dshDisplayVersion } = JSON.parse(await readFile(join(archive, 'package.json'), 'utf8'))
assert.equal(typeof dshDisplayVersion, 'string')
const storageModule = join(archive, 'dsh', 'node_modules', '@deepseek-ai', 'dsh-storage-json', 'lib', 'index.js')
const { JsonStorageBackend } = await import(pathToFileURL(storageModule).href)
const backend = new JsonStorageBackend(storageRoot)
const identity = createHash('sha256').update('api:https://127.0.0.1:19343:offline-balance-fixture').digest('hex')
const day = 86_400_000

try {
  const unit = await backend.kv.open({ name: 'uncensored_balance', version: 1, layout: 'per-record', tables: ['samples'], hasGlobal: false })
  const stored = (await unit.loadAll()).tables.samples?.[identity]
  if (mode === 'seed') {
    assert.equal(stored, undefined, 'The fixture account already has balance data.')
    const anchor = Date.now() - day / 24
    const samples = Array.from({ length: 513 }, (_, index) => ({
      time: anchor - (512 - index) * day / 12,
      wallets: [{ currency: 'CNY', toppedUp: (100 - index / 10_000).toFixed(4), granted: '0' }],
    }))
    await writeFile(sampleFile, JSON.stringify(samples) + '\n', { flag: 'wx' })
    await unit.putRecord('samples', identity, samples)
    console.log(JSON.stringify({ version: dshDisplayVersion, seeded: samples.length }))
  } else {
    const original = JSON.parse(await readFile(sampleFile, 'utf8'))
    assert.equal(original.length, 513)
    assert(Array.isArray(stored) && stored.length, 'The installed application has no samples for the fixture account.')
    const lastOld = original.at(-1).time
    const newest = stored.at(-1).time
    const remaining = stored.filter(sample => sample.time <= lastOld)
    const appended = stored.slice(remaining.length)
    if (mode === 'local') {
      assert.equal(appended.length, 0, 'Local history unexpectedly contains a new API observation.')
    } else {
      assert(appended.length > 0, 'The API did not append an observation.')
      for (const sample of appended) {
        assert(sample.time > lastOld)
        assert.deepEqual(sample.wallets, [{ currency: 'CNY', toppedUp: '987.654321', granted: '0' }])
      }
    }
    const expected = mode === 'age' ? original.filter(sample => sample.time >= newest - 30 * day) : original
    assert.deepEqual(remaining, expected)
    console.log(JSON.stringify({
      version: dshDisplayVersion, mode, original: original.length, retained: remaining.length,
      appended: appended.length, total: stored.length, oldest: stored[0].time, newest,
    }))
  }
} finally {
  await backend.close()
}
