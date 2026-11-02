/** Explicit administrator acceptance: only fresh test containers, local sockets and this run's owner records. */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fork, spawn } from 'node:child_process'
import { createServer, connect } from 'node:net'
import { createSocket } from 'node:dgram'
import { readFile, mkdir, writeFile, rm, lstat, realpath } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(new URL('../../../packages/guard/target-protection/package.json', import.meta.url))
const sdkRequire = createRequire(require.resolve('@microsoft/mxc-sdk/package.json'))
const baselineOnly = process.argv.slice(2).length === 1 && process.argv[2] === '--baseline'
if (process.argv.length > 2 && !baselineOnly) throw new Error('Only --baseline is supported')
const isAdmin = sdkRequire('koffi').load(join(process.env.SystemRoot, 'System32', 'shell32.dll')).func('int __stdcall IsUserAnAdmin()')
if (!baselineOnly && !isAdmin()) throw new Error('This isolated acceptance requires an administrator token; it does not elevate itself.')
const helper = resolve(repository, '.dsh-build/target-guard/debug/dshu-target-guard.exe')
const fingerprint = async () => createHash('sha256').update(await readFile(helper)).digest('hex')
const expected = await fingerprint()
const { recoverNativeIngress } = await import('../../../packages/guard/target-protection/lib/types/native-ingress-recovery.js')
const config = { executable: helper, requestTimeoutMs: 20000, shutdownTimeoutMs: 10000, pollIntervalMs: 10, diagnosticMaxBytes: 8192 }
const children = [], roots = [], sockets = new Set(), exits = new Map(), evidence = { helperSha256: expected, stages: [] }
const canary = createServer((socket) => {
  sockets.add(socket); socket.once('close', () => { sockets.delete(socket) }); socket.on('error', () => { socket.destroy() })
  socket.on('data', () => { socket.end('owned') })
})
const timeout = setTimeout(() => { for (const child of children) child.kill() }, 120000)
await new Promise((resolve, reject) => { canary.once('error', reject); canary.listen(0, '127.0.0.1', resolve) })

function worker(kind) {
  const child = fork(fileURLToPath(new URL('./windows-acceptance-owner.mjs', import.meta.url)), [kind, helper, String(canary.address().port)], {
    windowsHide: true, silent: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      SystemDrive: process.env.SystemDrive, TEMP: tmpdir(), TMP: tmpdir() },
  })
  children.push(child)
  const state = { owner: undefined, scope: undefined }
  let errors = ''
  child.stderr.on('data', (bytes) => { errors += bytes.toString() }); child.stdout.resume()
  const done = new Promise((resolve) => { child.once('close', (code) => { resolve(code) }) })
  exits.set(child, done)
  const ready = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('message', (message) => {
      if (message.type === 'workspace') { roots.push(message.root); state.owner = message.owner }
      if (message.type === 'ready') { state.scope = message.scope; resolve(message) }
      if (message.type === 'error') reject(new Error(message.message))
    })
    child.once('close', (code) => { reject(new Error(`Acceptance owner exited ${code}: ${errors}`)) })
  })
  return { child, done, ready, state }
}

async function probe(ports) {
  const tcp = (host, port) => new Promise((resolve) => {
    const socket = connect(port, host); let result = 'timeout'
    socket.on('connect', () => { socket.write('probe') })
    socket.on('data', () => { result = 'echo'; socket.destroy() })
    socket.on('error', (error) => { result = error.code; socket.destroy() })
    socket.setTimeout(750, () => { socket.destroy() }); socket.on('close', () => { resolve(result) })
  })
  const udp = (type, host, port) => new Promise((resolve) => {
    const socket = createSocket(type); let ended = false
    const finish = (result) => { if (ended) return; ended = true; clearTimeout(timer); socket.close(() => { resolve(result) }) }
    const timer = setTimeout(() => { finish('timeout') }, 750)
    socket.on('message', () => { finish('echo') }); socket.on('error', (error) => { finish(error.code) })
    socket.send('probe', port, host)
  })
  return Promise.all([tcp('127.0.0.1', ports.tcp4), tcp('::1', ports.tcp6), udp('udp4', '127.0.0.1', ports.udp4), udp('udp6', '::1', ports.udp6)])
}
async function recover(owner) {
  assert.equal(await fingerprint(), expected, 'Helper changed during administrator acceptance')
  return recoverNativeIngress(config, AbortSignal.timeout(25000), (options, args) => {
    const child = spawn(options.executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive } })
    const end = child.stdin.end.bind(child.stdin)
    child.stdin.end = (chunk, ...rest) => {
      try { assert.deepEqual(JSON.parse(String(chunk)).owner, owner, 'Recovery must select only this test owner') }
      catch (error) { child.kill(); throw error }
      return end(chunk, ...rest)
    }
    return child
  }, { pid: owner.pid, creationTime: BigInt(owner.created) })
}

try {
  const baseline = worker('baseline'), first = await baseline.ready
  assert.equal(first.ports.egress, 'owned')
  const allowed = await probe(first.ports); assert.deepEqual(allowed, ['echo', 'echo', 'echo', 'echo'])
  baseline.child.send('finish'); assert.equal(await baseline.done, 0)
  evidence.stages.push({ kind: 'baseline', incoming: allowed, egress: true })
  if (!baselineOnly) {
  const guarded = worker('guarded'), second = await guarded.ready
  assert.equal(second.ports.egress, 'owned')
  const protectedResult = await probe(second.ports); assert(protectedResult.every(value => value !== 'echo'))
  const active = await recover(guarded.state.owner)
  assert(active.retained.some(row => row.scope === second.scope && row.code === 'scope-active'))
  guarded.child.send('finish'); assert.equal(await guarded.done, 0)
  const cleared = await recover(guarded.state.owner); assert.deepEqual(cleared.removed, []); assert.deepEqual(cleared.retained, [])
  evidence.stages.push({ kind: 'guarded', incoming: protectedResult, egress: true, activeRecoveryRefused: true, normalCleanup: true })
  const orphan = worker('orphan'), third = await orphan.ready
  orphan.child.send('crash'); assert.equal(await orphan.done, 0)
  let recovered = false
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await recover(orphan.state.owner)
    if (result.removed.includes(third.scope)) { recovered = true; break }
    assert(result.retained.every(row => ['scope-active', 'observation-changed', 'observation-unavailable'].includes(row.code)), JSON.stringify(result))
  }
  assert(recovered, 'Orphan scope was not confirmed recovered')
  evidence.stages.push({ kind: 'orphan', recovered: true })
  }
} catch (error) {
  evidence.error = String(error); process.exitCode = 1
} finally {
  clearTimeout(timeout)
  for (const child of children) {
    if (child.exitCode !== null) continue
    if (child.connected) child.send('finish', () => {})
    const timer = setTimeout(() => { child.kill() }, 10000)
    let deadline
    try {
      await Promise.race([exits.get(child), new Promise((_, reject) => {
        deadline = setTimeout(() => { reject(new Error('Acceptance owner exit is unconfirmed; fixture directories retained')) }, 20000)
      })])
    } catch (error) { evidence.cleanupError = String(error); process.exitCode = 1 }
    finally { clearTimeout(timer); clearTimeout(deadline) }
  }
  for (const socket of sockets) socket.destroy()
  await new Promise(resolve => canary.close(resolve))
  for (const root of roots) {
    if (evidence.cleanupError) break
    if (!root.startsWith(tmpdir() + sep) || !root.includes('dshu-guard-acceptance-')) throw new Error('Unexpected fixture directory')
    try {
      if ((await lstat(root)).isSymbolicLink() || resolve(await realpath(root)) !== resolve(root)) throw new Error('Fixture path changed')
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch (error) { if (error.code !== 'ENOENT') { evidence.cleanupError = String(error); process.exitCode = 1 } }
  }
  const output = resolve(repository, '.dsh-build/guard-admin-results')
  await mkdir(output, { recursive: true })
  await writeFile(join(output, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify(evidence))
}
