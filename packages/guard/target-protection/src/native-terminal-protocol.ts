/** Validated terminal operations on the private inherited control channel. @module */
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

const text = z.string().refine(value => !value.includes('\0'))
const dimension = z.number().int().min(1).max(32767)
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

/** One terminal target; all user environment arrives after the trusted helper starts. */
export const nativeTerminalSpec = z.object({
  argv: z.tuple([text.min(1)]).rest(text), cwd: text.refine(isAbsolute), env: z.record(text, text),
  cols: dimension, rows: dimension, terminalType: text.min(1),
  graceMs: z.number().int().positive().max(MAX_TIMER_DELAY_MS), shellActivity: z.boolean(),
}).strict()

/** Operations are dispatched serially; malformed input stops the helper. */
export const nativeTerminalRequest = z.discriminatedUnion('operation', [
  z.object({ sequence, operation: z.literal('start'), spec: nativeTerminalSpec }).strict(),
  z.object({ sequence, operation: z.literal('write'), text: z.string() }).strict(),
  z.object({ sequence, operation: z.literal('resize'), cols: dimension, rows: dimension }).strict(),
  z.object({ sequence, operation: z.literal('foreground') }).strict(),
  z.object({ sequence, operation: z.literal('activity') }).strict(),
  z.object({ sequence, operation: z.literal('signal'), signal: z.enum(['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGTSTP', 'SIGHUP']) }).strict(),
  z.object({ sequence, operation: z.literal('close') }).strict(),
])

/** Successful operation values are validated by their requesting consumer. */
export const nativeTerminalReply = z.discriminatedUnion('ok', [
  z.object({ sequence, ok: z.literal(true), value: z.unknown() }).strict(),
  z.object({ sequence, ok: z.literal(false), message: z.string().max(4096) }).strict(),
])

/** Windows terminal drivers report signed or unsigned native status codes. */
export const nativeTerminalOutcome = z.object({
  exitCode: z.number().int().min(-2147483648).max(0xffffffff).nullable(), signal: z.null(),
}).strict()

/** Parsed helper request. */
export type NativeTerminalRequest = z.infer<typeof nativeTerminalRequest>
/** Fully resolved target passed to the native terminal allocator. */
export type NativeTerminalLaunch = z.infer<typeof nativeTerminalSpec>

/** Private execution environment names supplied by the enclosing native provider. */
export const NATIVE_TERMINAL_FIXED_ENV = new RegExp(
  '^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_USE_ENV_PROXY|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LOCALAPPDATA|DSH_SUBPROCESS_CONTROL)$', 'iu')
