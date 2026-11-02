/** One-shot orphan recovery; partial results remain explicit and no active execution is admitted. @module */
import { spawn } from 'node:child_process'
import { addAbortListener } from 'node:events'
import { z } from 'zod'
import { currentWindowsProcessIdentity } from '@deepseek-ai/dsh-win32-process'
import type { WindowsProcessIdentity } from '@deepseek-ai/dsh-win32-process'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { nativeIngressOptionsSchema, type NativeIngressOptions, type NativeIngressLauncher } from './native-ingress.ts'

/** Maintenance results distinguish removed scopes, retained scopes and unreadable historical records. */
export const nativeIngressRecoverySchema = z.object({
  removed: z.array(z.uuid()).max(128),
  retained: z.array(z.object({ scope: z.uuid(), code: z.string().min(1).max(80) }).strict()).max(128),
  unrecognized: z.number().int().min(0).max(4096),
}).strict()
/** The helper never interprets retained or unrecognized records as successful cleanup. */
export type NativeIngressRecovery = z.infer<typeof nativeIngressRecoverySchema>

const reply = z.discriminatedUnion('ok', [
  z.object({ sequence: z.literal(1), ok: z.literal(true), value: nativeIngressRecoverySchema }).strict(),
  z.object({ sequence: z.literal(1), ok: z.literal(false), error: z.object({
    code: z.string().min(1).max(80), message: z.string().max(4096), win32: z.number().int().nonnegative().optional(),
  }).strict() }).strict(),
])

/**
 * Ask a fresh helper to inspect and recover ended scopes belonging to the authenticated account.
 * @param options - Trusted fixed helper and bounded transport configuration.
 * @param signal - Cancellation; completed per-scope cleanup is not rolled back or silently replayed.
 * @param launcher - Optional isolated transport fixture; default startup never elevates the Host.
 * @param owner - Optional original owner identity; omission inspects all supported records for this account.
 * @returns Per-scope results after helper exit. Failure can mean partial cleanup; re-inspection is safe.
 */
export async function recoverNativeIngress(
  options: NativeIngressOptions, signal: AbortSignal, launcher: NativeIngressLauncher = (config, args) => spawn(config.executable, args, {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive },
  }), owner?: WindowsProcessIdentity,
): Promise<NativeIngressRecovery> {
  const config = nativeIngressOptionsSchema.parse(options)
  signal.throwIfAborted()
  const caller = currentWindowsProcessIdentity()
  const selected = owner === undefined ? undefined : z.object({ pid: z.number().int().positive().max(0xffffffff),
    created: z.string().regex(/^[1-9][0-9]{0,19}$/u),
  }).strict().parse({ pid: owner.pid, created: String(owner.creationTime) })
  const child = launcher(config, ['--stdio', String(caller.pid), String(caller.creationTime),
    String(config.shutdownTimeoutMs), String(config.pollIntervalMs)])
  const finished = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  const deadline = Promise.withResolvers<never>()
  let output = Buffer.alloc(0), diagnostic = Buffer.alloc(0), failure: Error | undefined
  let exitTimer: ReturnType<typeof setTimeout> | undefined
  const stop = (cause: unknown): void => {
    if (failure !== undefined) return
    failure = cause instanceof Error ? cause : new Error('Native recovery transport failed.', { cause })
    exitTimer = setTimeout(() => { deadline.reject(new HarnessError(
      'Recovery helper exit is unconfirmed; some closed-scope rules may already have been removed.', 'TARGET_INGRESS_RECOVERY_UNCONFIRMED',
    )) }, config.shutdownTimeoutMs)
    child.stdin.destroy(); child.kill()
  }
  child.on('error', stop); child.stdin.on('error', stop); child.stdout.on('error', stop); child.stderr.on('error', stop)
  child.stdout.on('data', (bytes: Buffer) => {
    if (output.length + bytes.length > 65536) { stop(new Error('Recovery reply exceeds its wire limit.')); return }
    output = Buffer.concat([output, bytes])
  })
  child.stderr.on('data', (bytes: Buffer) => {
    const remaining = config.diagnosticMaxBytes - diagnostic.length
    if (remaining > 0) diagnostic = Buffer.concat([diagnostic, bytes.subarray(0, remaining)])
  })
  child.once('close', (code, exitSignal) => { finished.resolve({ code, signal: exitSignal }) })
  const timeout = setTimeout(() => { stop(new HarnessError(
    'Recovery timed out; completed cleanup is not reversed. Inspect again before reporting success.', 'TARGET_INGRESS_RECOVERY_TIMEOUT',
  )) }, config.requestTimeoutMs)
  using _abort = addAbortListener(signal, () => { stop(new HarnessError(
    'Recovery was cancelled; some closed-scope rules may already have been removed.', 'TARGET_INGRESS_RECOVERY_CANCELLED', { cause: signal.reason },
  )) })
  try {
    child.stdin.end(`${JSON.stringify({ operation: 'recover', sequence: 1, ...selected === undefined ? {} : { owner: selected } })}\n`)
    const result = await Promise.race([finished.promise, deadline.promise])
    if (failure !== undefined) throw failure
    let decoded: unknown
    try { decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output)) }
    catch (error) { throw new HarnessError('Invalid recovery encoding or JSON.', 'TARGET_INGRESS_RECOVERY_FAILED', { cause: error }) }
    const parsed = reply.safeParse(decoded)
    if (!parsed.success) throw new HarnessError(`Invalid recovery reply. ${diagnostic.toString('utf8')}`, 'TARGET_INGRESS_RECOVERY_FAILED')
    if (!parsed.data.ok) throw new HarnessError(parsed.data.error.message, 'TARGET_INGRESS_RECOVERY_REFUSED', { cause: parsed.data.error })
    if (result.code !== 0 || result.signal !== null) {
      throw new HarnessError('Recovery helper failed after reporting results; inspect again.', 'TARGET_INGRESS_RECOVERY_FAILED')
    }
    return parsed.data.value
  } finally { clearTimeout(timeout); if (exitTimer !== undefined) clearTimeout(exitTimer) }
}
