/** Exercise the release writer and the pinned kernel reader in their own workspaces. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const kernel = fileURLToPath(new URL('../kernel/0.2.3-alpha.2/', import.meta.url))
const manifest = JSON.parse(await readFile(join(kernel, 'source.json'), 'utf8'))
const [oldPath, newPath, electronPath, ...extra] = process.argv.slice(2)
if (!oldPath || !newPath || extra.length) throw new Error('Usage: node scripts/verify-kernel-released-data.mjs <release checkout> <restored candidate> [candidate Electron executable]')
const writer = resolve(oldPath)
const reader = resolve(newPath)

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw result.error ?? new Error(result.stderr)
  return result.stdout.trim()
}

assert.equal(git(writer, 'rev-parse', 'HEAD'), '95325688c9134480b7289341ed4eda26e40a55d0')
assert.equal(git(writer, 'write-tree'), git(writer, 'rev-parse', 'HEAD^{tree}'))
assert.equal(git(reader, 'rev-parse', 'HEAD'), manifest.base)
assert.equal(git(reader, 'write-tree'), manifest.tree)
for (const root of [writer, reader]) git(root, 'diff', '--quiet')

async function probe(root, phase, active) {
  const name = 'released-data-' + randomUUID() + '.spec.ts'
  const test = join('scripts', name)
  const destination = join(root, test)
  await copyFile(join(kernel, 'verification', 'released-data.spec.ts.in'), destination, constants.COPYFILE_EXCL)
  try {
    const electron = phase !== 'write' && electronPath ? resolve(electronPath) : undefined
    const env = { ...process.env, DSHU_VERIFY_DATA: active, DSHU_VERIFY_PHASE: phase }
    if (electron) {
      env.ELECTRON_RUN_AS_NODE = '1'
      env.DSHU_VERIFY_ELECTRON = '1'
    }
    const result = spawnSync(electron ?? process.execPath, [
      join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--maxWorkers=1', test,
    ], { cwd: root, stdio: 'inherit', windowsHide: true, env })
    if (result.status !== 0) throw result.error ?? new Error('Release data check failed during ' + phase)
  } finally { await unlink(destination) }
}

async function fileHashes(directory, prefix = '') {
  const files = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name
    const path = join(directory, entry.name)
    if (entry.isDirectory()) Object.assign(files, await fileHashes(path, key + '/'))
    else {
      assert(entry.isFile(), 'Unexpected fixture file ' + key)
      files[key] = createHash('sha256').update(await readFile(path)).digest('hex')
    }
  }
  return files
}

const root = await mkdtemp(join(tmpdir(), 'dshu-released-data-'))
const active = join(root, 'active')
const original = join(root, 'original')
await mkdir(active)
try {
  await probe(writer, 'write', active)
  await rename(active, original)
  const before = await fileHashes(original)
  assert(Object.keys(before).some(path => path.startsWith('sessions/') && path.endsWith('/session.v4.jsonl.zstd')))
  assert(before['workspace/story/materials.json'] && before['storages/spending.sqlite'])
  await cp(original, active, { recursive: true, errorOnExist: true, force: false })
  assert.deepEqual(await fileHashes(active), before)
  await probe(reader, 'read', active)
  await probe(reader, 'reopen', active)
  assert.deepEqual(await fileHashes(original), before)
  process.stdout.write('Release and candidate passed. Original files with matching SHA-256: ' + Object.keys(before).length + '\n')
  await rm(root, { recursive: true })
} catch (error) {
  console.error('Verification data retained at ' + root)
  throw error
}
