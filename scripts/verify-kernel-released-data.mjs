/** Exercise the release writer and the pinned kernel reader in their own workspaces. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const kernel = fileURLToPath(new URL('../kernel/0.2.3-alpha.2/', import.meta.url))
const manifest = JSON.parse(await readFile(join(kernel, 'source.json'), 'utf8'))
const [oldPath, newPath, option, ...extra] = process.argv.slice(2)
const checkEventTypes = option === '--check-event-types'
if (!oldPath || !newPath || extra.length || (option?.startsWith('--') && !checkEventTypes)) {
  throw new Error('Usage: node scripts/verify-kernel-released-data.mjs <release checkout> <restored candidate> [candidate Electron executable | --check-event-types]')
}
const electronPath = checkEventTypes ? undefined : option
const writer = resolve(oldPath)
const reader = resolve(newPath)

function git(cwd, ...args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw result.error ?? new Error(result.stderr.trim() || ('git ' + args.join(' ') + ' failed in ' + cwd))
  return result.stdout.trim()
}

const releases = new Map([
  ['95325688c9134480b7289341ed4eda26e40a55d0', 'v2026.11.23.0'],
  ['7eaeddc6050ee60e114cc3ef0d81de9c1371aacd', 'v2026.11.24.3'],
])
const release = releases.get(git(writer, 'rev-parse', 'HEAD'))
assert(release, 'Writer must be a supported DSHU release checkout')
git(writer, 'diff', '--cached', '--quiet', 'HEAD', '--')
assert.equal(git(reader, 'rev-parse', 'HEAD'), manifest.base)
git(reader, 'diff', '--cached', '--quiet', manifest.tree, '--')
for (const root of [writer, reader]) git(root, 'diff', '--quiet')

function knownEventTypes(root) {
  const result = spawnSync(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '--eval',
    "import { KNOWN_SESSION_EVENT_TYPES as types } from './packages/core/session/src/known-event-types.ts'; console.log(JSON.stringify([...types]))",
  ], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) throw result.error ?? new Error(result.stderr)
  return new Set(JSON.parse(result.stdout))
}
const releasedTypes = knownEventTypes(writer)
const candidateTypes = knownEventTypes(reader)
const missing = [...releasedTypes].filter(type => !candidateTypes.has(type)).sort()
console.log(release + ' event types recognized by the candidate: ' + (releasedTypes.size - missing.length) + '/' + releasedTypes.size)
if (missing.length) console.log('Missing released event types: ' + missing.join(', '))
if (checkEventTypes) process.exit(missing.length ? 1 : 0)

async function probe(root, phase, active) {
  const name = 'released-data-' + randomUUID() + '.spec.ts'
  const test = join('scripts', name)
  const destination = join(root, test)
  const fixture = phase === 'desktop' ? 'released-desktop.spec.ts.in' : 'released-data.spec.ts.in'
  await copyFile(join(kernel, 'verification', fixture), destination, constants.COPYFILE_EXCL)
  try {
    const electron = phase !== 'write' && electronPath ? resolve(electronPath) : undefined
    const user = join(active, 'user')
    const env = { ...process.env, HOME: user, USERPROFILE: user, DSHU_VERIFY_DATA: active, DSHU_VERIFY_PHASE: phase }
    delete env.DSH_HOME
    delete env.DSH_UNCENSORED_HOME
    if (electron) {
      env.ELECTRON_RUN_AS_NODE = '1'
      env.DSHU_VERIFY_ELECTRON = '1'
    }
    const result = spawnSync(electron ?? process.execPath, [
      join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--maxWorkers=1', test,
    ], { cwd: root, stdio: phase === 'desktop' ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true, env })
    if (phase === 'desktop') {
      for (const output of [result.stdout, result.stderr]) {
        if (output) process.stdout.write(output.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
      }
    }
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
const official = join('user', '.dsh')
await mkdir(join(active, official), { recursive: true })
await writeFile(join(active, official, 'official-profile.txt'), 'Official installation fixture\n')
async function verifyOfficialHome() {
  const directory = join(active, official)
  assert.deepEqual(await readdir(directory), ['official-profile.txt'])
  assert.equal(await readFile(join(directory, 'official-profile.txt'), 'utf8'), 'Official installation fixture\n')
}
try {
  await probe(writer, 'write', active)
  await verifyOfficialHome()
  await rename(active, original)
  const before = await fileHashes(original)
  assert(Object.keys(before).some(path => path.startsWith('sessions/') && path.endsWith('/session.v4.jsonl.zstd')))
  assert(before['workspace/story/materials.json'] && before['storages/spending.sqlite'] && before['storages/memory.json'])
  await cp(original, active, { recursive: true, errorOnExist: true, force: false })
  assert.deepEqual(await fileHashes(active), before)
  await probe(reader, 'read', active)
  await probe(reader, 'reopen', active)
  if (electronPath && ['win32', 'darwin'].includes(process.platform)) {
    await probe(reader, 'desktop', active)
    const plugins = join('user', '.dsh-uncensored', 'profiles', 'desktop', 'node_modules')
    assert.deepEqual(await fileHashes(join(active, plugins)), await fileHashes(join(original, plugins)))
  }
  await verifyOfficialHome()
  assert.deepEqual(await fileHashes(original), before)
  process.stdout.write(release + ' and candidate ' + manifest.tree + ' passed. Original files with matching SHA-256: ' + Object.keys(before).length + '\n')
  await rm(root, { recursive: true })
} catch (error) {
  console.error('Verification data retained at ' + root)
  throw error
}
