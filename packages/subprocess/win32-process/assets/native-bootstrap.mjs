/** Private confined-worker bootstrap. No workload or development loader runs before Job attachment. */
import { mkdirSync, readSync, realpathSync, writeSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import koffi from 'koffi'

const [nonce, entry, hook, tsconfig, temporaryRoot] = process.argv.slice(2)
if (!nonce || !entry || !temporaryRoot || !isAbsolute(temporaryRoot)
  || !/^[a-f0-9-]{36}$/.test(nonce) || new URL(entry).protocol !== 'file:') {
  throw new Error('Invalid private native bootstrap invocation')
}
const kernel = koffi.load('kernel32.dll')
const current = kernel.func('void * GetCurrentProcess()')
const times = kernel.func('int GetProcessTimes(void *, void *, void *, void *, void *)')
const created = Buffer.alloc(8)
if (!times(current(), created, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8))) throw new Error('GetProcessTimes failed')
writeSync(1, `${JSON.stringify({ nonce, pid: process.pid, creationTime: String(created.readBigUInt64LE()) })}\n`)
const go = Buffer.alloc(1)
if (readSync(0, go, 0, 1, null) !== 1 || go[0] !== 1) throw new Error('Native startup was not admitted')
try {
  const root = realpathSync(temporaryRoot), temporary = resolve(tmpdir()), inside = relative(root, temporary)
  if (isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) throw new Error('Native temporary directory escaped its private root')
  mkdirSync(temporary, { recursive: true })
  const actual = relative(root, realpathSync(temporary))
  if (isAbsolute(actual) || actual === '..' || actual.startsWith(`..${sep}`)) throw new Error('Native temporary directory resolved outside its private root')
  if (hook) {
    if (new URL(hook).protocol !== 'file:' || !tsconfig) throw new Error('Invalid private source loader')
    const { register } = await import(hook)
    register({ tsconfig })
  }
  const worker = await import(entry)
  await worker.runNativeWorker(process.stdin, process.stdout)
} catch (error) {
  process.stderr.write(`Native worker failed: ${error instanceof Error ? error.message : 'unknown failure'}\n`)
  process.exitCode = 127
}
