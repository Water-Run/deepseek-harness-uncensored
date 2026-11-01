/** Real Windows Job accounting must include descendants after the trusted root exits. @module */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { attachObservedWindowsJob, currentWindowsProcessIdentity, type ObservedWindowsJob, type WindowsProcessIdentity } from '../src/observed-job.ts'

const fixture = fileURLToPath(new URL('./fixtures/observed-job.mjs', import.meta.url))

async function bootstrap() {
  const nonce = randomUUID()
  const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
    TEMP: process.env.TEMP, TMP: process.env.TMP }
  const child = spawn(process.execPath, [fixture, nonce], {
    env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  })
  let errors = ''
  child.stderr.setEncoding('utf8').on('data', (text: string) => { errors += text })
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', () => { resolve() })
  })
  void completion.catch(() => {}) // The test and its registered teardown both await completion.
  const lines = createInterface({ input: child.stdout })
  const output = lines[Symbol.asyncIterator]()
  let job: ObservedWindowsJob | undefined
  onTestFinished(async () => {
    try {
      if (job !== undefined) {
        job.terminate(1)
        expect(await job.waitForExit(10, AbortSignal.timeout(30_000)), errors).toBe(true)
        job.close()
      }
    } finally {
      child.kill()
      await completion
      lines.close()
    }
  })
  const first = await output.next()
  if (first.done) throw new Error(`Trusted bootstrap did not identify itself: ${errors}`)
  const parsed: unknown = JSON.parse(first.value)
  if (typeof parsed !== 'object' || parsed === null || !('nonce' in parsed) || parsed.nonce !== nonce
    || !('pid' in parsed) || typeof parsed.pid !== 'number' || parsed.pid !== child.pid || !('creationTime' in parsed)
    || typeof parsed.creationTime !== 'string' || !/^\d+$/.test(parsed.creationTime)) {
    throw new Error('Invalid trusted bootstrap identity')
  }
  const identity: WindowsProcessIdentity = { pid: parsed.pid, creationTime: BigInt(parsed.creationTime) }
  return { child, output, completion, identity, attach() { return job = attachObservedWindowsJob(identity) } }
}

describe.skipIf(process.platform !== 'win32')('independently owned Windows Job', () => {
  it('reads the current process creation time through the production bindings', () => {
    const identity = currentWindowsProcessIdentity()
    expect(identity.pid).toBe(process.pid)
    expect(identity.creationTime).toBeGreaterThan(0n)
    expect(currentWindowsProcessIdentity()).toEqual(identity)
  })
  it('keeps a detached descendant owned and observable after its bootstrap exits', async () => {
    const h = await bootstrap(), job = h.attach()
    expect(job.isEmpty()).toBe(false)
    h.child.stdin.write('start\n')
    expect((await h.output.next()).value).toMatch(/^\{"child":\d+\}$/)
    h.child.stdin.write('exit\n')
    await h.completion
    expect(h.child.exitCode).toBe(0)
    expect(job.isEmpty()).toBe(false)
    expect(() => { job.close() }).toThrow(expect.objectContaining({ code: 'still-running' }))
    job.terminate(1)
    expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
    job.close()
    expect(job.isEmpty()).toBe(true)
  })

  it('rejects a different creation time without terminating the live bootstrap', async () => {
    const h = await bootstrap()
    expect(() => attachObservedWindowsJob({ ...h.identity, creationTime: h.identity.creationTime + 1n }))
      .toThrow(expect.objectContaining({ code: 'identity-changed' }))
    const job = h.attach()
    h.child.stdin.write('exit\n')
    await h.completion
    expect(h.child.exitCode).toBe(0)
    expect(await job.waitForExit(10, AbortSignal.timeout(30_000))).toBe(true)
  })
})
