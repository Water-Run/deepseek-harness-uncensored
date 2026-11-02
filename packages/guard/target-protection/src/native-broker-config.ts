/** Validated private configuration for the trusted native broker, never supplied by a target command. @module */
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { nativeIngressOptionsSchema } from './native-ingress.ts'

const path = z.string().min(1).refine(value => !value.includes('\0') && isAbsolute(value))
const interval = z.number().int().positive().max(MAX_TIMER_DELAY_MS)
const proxy = z.url().refine((value) => {
  const url = new URL(value)
  return url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
    && url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === ''
})

/** Wire configuration from the rule owner to a broker already held in a strict outer Job. */
export const nativeBrokerConfigSchema = z.object({
  cwd: path, temporaryRoot: path,
  files: z.object({
    readonlyPaths: z.array(path), readwritePaths: z.array(path), deniedPaths: z.array(path), enumeratePaths: z.array(path),
  }).strict(),
  proxyUrl: proxy.nullable(),
  ingress: nativeIngressOptionsSchema.optional(),
  startupTimeoutMs: interval,
  timeoutMs: z.number().int().min(0).max(MAX_TIMER_DELAY_MS),
}).strict()

/** Detached policy and startup timing owned by one broker invocation. */
export type NativeBrokerConfig = z.infer<typeof nativeBrokerConfigSchema>
