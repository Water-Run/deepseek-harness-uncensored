/** Private inherited-pipe client for the Windows inbound guard; never elevates the application. @module */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { addAbortListener } from 'node:events'
import { currentWindowsProcessIdentity } from '@deepseek-ai/dsh-win32-process'
import type { ObservedWindowsJob, WindowsProcessIdentity } from '@deepseek-ai/dsh-win32-process'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

/** Explicit helper path and operation budgets supplied by its trusted mounting owner. */
export interface NativeIngressOptions {
  executable: string
  requestTimeoutMs: number
  shutdownTimeoutMs: number
  pollIntervalMs: number
  diagnosticMaxBytes: number
}

/** The caller stops dependent work on failure and releases this lease only after the entire range exits. */
export interface NativeIngressLease {
  readonly id: string
  readonly failed: Promise<never>
  /** Remove rules after independently checking Job quiescence, then join the helper and its pipes. */
  release(): Promise<void>
  /** Terminate the owned range, confirm quiescence, then remove rules and join the helper. */
  stop(): Promise<void>
}

/** Private helper configuration accepted from its trusted owner, never from command arguments. */
export const nativeIngressOptionsSchema = z.object({ executable: z.string().min(1).refine(value => isAbsolute(value) && !value.includes('\0')),
  requestTimeoutMs: z.number().int().positive().max(MAX_TIMER_DELAY_MS), shutdownTimeoutMs: z.number().int().positive().max(300000),
  pollIntervalMs: z.number().int().positive().max(300000), diagnosticMaxBytes: z.number().int().positive().max(1048576),
}).strict().refine(value => value.pollIntervalMs <= value.shutdownTimeoutMs)
const replySchema = z.discriminatedUnion('ok', [
  z.object({ sequence: z.number().int().positive(), ok: z.literal(true),
    value: z.union([z.object({ scope: z.uuid() }).strict(), z.null()]) }).strict(),
  z.object({ sequence: z.number().int().positive(), ok: z.literal(false),
    error: z.object({ code: z.string().min(1).max(80), message: z.string().max(4096),
      win32: z.number().int().nonnegative().optional() }).strict(),
  }).strict(),
])

/** Fixed helper launcher; injected tests substitute the transport, not the guard's admission decision. */
export type NativeIngressLauncher = (options: NativeIngressOptions, args: readonly string[]) => ChildProcessWithoutNullStreams

function launch(options: NativeIngressOptions, args: readonly string[]): ChildProcessWithoutNullStreams {
  return spawn(options.executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive } })
}

/**
 * Install an inbound guard while the target is still held at its trusted bootstrap barrier.
 * @param options - Owner-selected private helper and bounded IPC configuration.
 * @param job - Live, non-breakaway Job containing only the expected target bootstrap.
 * @param target - Identity already verified over the bootstrap's private startup pipe.
 * @param signal - Execution lifetime; cancellation terminates the Job and starts guarded cleanup.
 * @param launcher - Optional transport fixture; production uses only the configured fixed executable.
 * @returns A lease after native rule installation succeeds; failure stops the Job and never authorizes target startup.
 */
export async function startNativeIngress(
  options: NativeIngressOptions, job: ObservedWindowsJob, target: WindowsProcessIdentity, signal: AbortSignal,
  launcher: NativeIngressLauncher = launch,
): Promise<NativeIngressLease> {
  const config = nativeIngressOptionsSchema.parse(options)
  signal.throwIfAborted()
  const owner = currentWindowsProcessIdentity(), handle = job.borrowHandle()
  const child = launcher(config, ['--stdio', String(owner.pid), String(owner.creationTime),
    String(config.shutdownTimeoutMs), String(config.pollIntervalMs)])
  const failed = Promise.withResolvers<never>(), ended = Promise.withResolvers<void>()
  void failed.promise.catch(() => {})
  let pending: { sequence: number; resolve(value: z.infer<typeof replySchema>): void; reject(error: Error): void } | undefined
  let buffer = Buffer.alloc(0), diagnostic = Buffer.alloc(0), sequence = 0
  let closing: Promise<void> | undefined, expectedExit = false, broken: Error | undefined, published = false
  const failure = (cause: unknown): Error => {
    let error = cause instanceof Error ? cause : new Error('Inbound guard failed.', { cause })
    try { job.terminate(1) } catch (stopError) { error = new AggregateError([error, stopError], 'Inbound guard and termination failed.') }
    broken ??= error
    failed.reject(error); pending?.reject(error); pending = undefined
    if (published && closing === undefined) void close(true).catch(() => {}) // failed carries the error; cleanup retains persistent rules.
    return error
  }
  child.on('error', failure)
  child.stdin.on('error', failure)
  child.stderr.on('error', failure)
  child.stderr.on('data', (chunk: Buffer) => {
    const remaining = config.diagnosticMaxBytes - diagnostic.length
    if (remaining > 0) diagnostic = Buffer.concat([diagnostic, chunk.subarray(0, remaining)])
  })
  child.stdout.on('error', failure)
  child.stdout.on('data', (chunk: Buffer) => {
    if (buffer.length + chunk.length > 65536) { failure(new Error('Inbound guard reply exceeds its wire limit.')); return }
    buffer = Buffer.concat([buffer, chunk])
    const newline = buffer.indexOf(10)
    if (newline < 0) return
    try {
      if (newline !== buffer.length - 1 || pending === undefined) throw new Error('Unexpected inbound guard reply.')
      const reply = replySchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, newline))))
      if (reply.sequence !== pending.sequence) throw new Error('Inbound guard reply sequence differs from its request.')
      const operation = pending
      pending = undefined; buffer = Buffer.alloc(0)
      operation.resolve(reply)
    } catch (error) { failure(error) }
  })
  child.once('close', (code, exitSignal) => {
    if (!expectedExit || code !== 0 || exitSignal !== null || pending !== undefined || buffer.length !== 0) {
      failure(new HarnessError(`Inbound guard exited before confirmed cleanup. ${diagnostic.toString('utf8')}`, 'TARGET_INGRESS_FAILED'))
    }
    ended.resolve()
  })
  const request = async (operation: 'install' | 'release' | 'stop') => {
    if (broken !== undefined) throw broken
    const response = Promise.withResolvers<z.infer<typeof replySchema>>()
    const number = ++sequence
    const timer = setTimeout(() => { failure(new HarnessError('Inbound guard request timed out.', 'TARGET_INGRESS_TIMEOUT')) }, config.requestTimeoutMs)
    pending = { sequence: number, resolve: response.resolve, reject: response.reject }
    try {
      child.stdin.write(`${JSON.stringify({ sequence: number, operation, ...operation === 'install'
        ? { admission: { target: { pid: target.pid, created: String(target.creationTime) }, job: String(handle) } } : {} })}\n`)
      const reply = await response.promise
      if (!reply.ok) throw new HarnessError(reply.error.message, 'TARGET_INGRESS_REFUSED', { cause: reply.error })
      return reply.value
    } finally { clearTimeout(timer) }
  }
  const close = (stop: boolean): Promise<void> => {
    if (closing !== undefined) return closing
    const completion = Promise.withResolvers<void>()
    closing = completion.promise
    const cleanup = (async () => {
      let error: Error | undefined
      try {
        if (stop || broken !== undefined) job.terminate(1)
        if (!await job.waitForExit(config.pollIntervalMs, AbortSignal.timeout(config.shutdownTimeoutMs))) {
          throw new HarnessError('Native Job shutdown is unconfirmed; inbound rules must remain.', 'TARGET_INGRESS_CLEANUP_UNCONFIRMED')
        }
        const result = await request(stop ? 'stop' : 'release')
        if (result !== null) throw new Error('Inbound guard cleanup returned an unexpected value.')
        expectedExit = true
        child.stdin.end()
      } catch (cause) { error = failure(cause); child.kill() }
      const deadline = Promise.withResolvers<never>()
      const timer = setTimeout(() => {
        const timeout = new HarnessError('Inbound guard did not exit after cleanup; its rules may remain.', 'TARGET_INGRESS_CLEANUP_UNCONFIRMED')
        failure(timeout); child.stdin.destroy(); child.kill(); deadline.reject(timeout)
      }, config.shutdownTimeoutMs)
      try { await Promise.race([ended.promise, deadline.promise]) } finally { clearTimeout(timer); abort[Symbol.dispose]() }
      if (error !== undefined) throw error
      if (broken !== undefined) throw broken
    })()
    void cleanup.then(completion.resolve, completion.reject)
    return closing
  }
  const abort = addAbortListener(signal, () => {
    if (published) { void close(true).catch(failure); return }
    try { job.terminate(1) } catch (error) { failure(error) }
  })
  try {
    const ready = await request('install')
    signal.throwIfAborted()
    if (ready === null) throw new Error('Inbound guard omitted its scope identifier.')
    published = true
    return { id: ready.scope, failed: failed.promise, release: () => close(false), stop: () => close(true) }
  } catch (error) {
    if (!signal.aborted) failure(error)
    try { await close(true) } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Inbound admission failed; cleanup also reported failure.') }
    throw error
  }
}
