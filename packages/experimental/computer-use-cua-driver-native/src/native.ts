/**
 * Computer use through the in-process Cua Driver native SDK and its own tools.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { addAbortListener } from 'node:events'
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { z } from 'zod'
import type { CuaDriver as NativeDriver } from '@trycua/cua-driver'
import type {} from '@deepseek-ai/dsh-computer-use'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'

const ToolCatalog = z.object({
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()),
    outputSchema: z.unknown().optional(),
  })),
})

/** DeepSeek's function-name alphabet and maximum length are protocol constants. */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/u

const GUIDANCE = `Cua Driver native computer-use tools operate the host desktop. Discover the exact app and window, then get a fresh window snapshot before acting. Use element_token from that snapshot, or coordinates from its screenshot. A new snapshot of that window invalidates its earlier element tokens. Select either target or the legacy pid/window_id fields; do not combine them.

Prefer background delivery. A refusal does not authorize a foreground retry. Verify the requested outcome from fresh state after an action; a delivered click alone does not prove the outcome. After cancellation, inspect current state before retrying because completed input is not rolled back. Other sessions and applications may change the same desktop.

On macOS, cursor-overlay operations may return facility_unavailable even when screenshots and input work.`

/** Execution admission held until all native calls, image admission and SDK cleanup settle. */
export interface NativeComputerUseLease {
  /** Aborts when the issuing policy generation or execution owner is withdrawn. */
  readonly signal: AbortSignal
  /** Recheck admission before native initialization or dispatch. */
  check(): void
  /** Release the execution owner after confirmed cleanup; repeated calls have no effect. */
  release(): void
}

/**
 * Mount the native provider under one mandatory execution lease.
 * @param ctx - Context owning the provider and tool contributions.
 * @param lease - Checked authorization; revocation closes the provider before releasing it.
 * @returns Initial catalog activation; startup failures unwind resources and the lease.
 */
export async function mountNativeComputerUse(ctx: Context, lease: NativeComputerUseLease): Promise<void> {
  const lifetime = new AbortController()
  const pending = new Set<Promise<unknown>>()
  let driver: NativeDriver | undefined
  // Cordis announces disposal before it awaits asynchronous plugin startup.
  ctx.on('internal/plugin', (fiber) => {
    if (fiber === ctx.fiber && fiber.uid === null) lifetime.abort()
  }, { global: true })
  let ready: Promise<void> = Promise.resolve()
  const dispose = ctx.effect(function* () {
    yield () => { lease.release() }
    lease.check()
    yield ctx.computerUse.register(ComputerUseProviderName('cua-driver-native'))
    yield async () => {
      lifetime.abort()
      // apply() reports startup failure; teardown still owns its native handle.
      await ready.catch(() => {})
      await Promise.allSettled(pending)
      if (driver !== undefined) {
        await driver.shutdown()
        driver.uniffiDestroy()
      }
    }
    const child = ctx.plugin({
      name: 'computer-use-cua-driver-native-runtime',
      inject: ['tools', 'systemPrompt'],
      apply: mountRuntime,
    })
    yield child.dispose
    ready = Promise.resolve(child).then(() => {})
  }, 'computer-use-cua-driver-native.runtime')
  ctx.effect(() => {
    const listener = addAbortListener(lease.signal, () => {
      lifetime.abort()
      void Promise.resolve(dispose()).catch((error: unknown) => {
        ctx.logger.error('Computer-use execution could not be closed after policy revocation:', error)
      })
    })
    return () => { listener[Symbol.dispose]() }
  }, 'computer-use-cua-driver-native.policy')
  try {
    await ready
    lease.check()
  } catch (error) {
    await dispose()
    throw error
  }

  /** The child owns tool registrations; the outer effect owns native teardown. */
  async function mountRuntime(inner: Context): Promise<void> {
    lease.check()
    const { CuaDriver } = await import('@trycua/cua-driver')
    lifetime.signal.throwIfAborted()
    lease.check()
    // The generated constructor returns its class with an owned binding handle,
    // but declares only CuaDriverLike, which omits uniffiDestroy().
    const activeDriver = driver = CuaDriver.create(undefined) as NativeDriver
    const catalog = ToolCatalog.parse(JSON.parse(await activeDriver.listToolsJson({
      signal: AbortSignal.any([lifetime.signal, lease.signal]),
    })))
    lifetime.signal.throwIfAborted()
    lease.check()
    const names = new Set<string>()
    for (const tool of catalog.tools) {
      const publicName = `cua_driver_native__${tool.name}`
      if (!TOOL_NAME.test(publicName)) {
        throw new Error(`Cua Driver tool "${tool.name}" exceeds the supported function-name format`)
      }
      if (names.has(publicName)) throw new Error(`Cua Driver listed tool "${tool.name}" more than once`)
      names.add(publicName)
      const definition = createMcpToolDefinition(inner, {
        name: publicName,
        rawName: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        async call(args, execution) {
          lease.check()
          const combined = AbortSignal.any([execution.signal, lifetime.signal, lease.signal])
          combined.throwIfAborted()
          const operation = activeDriver.callTool(tool.name, JSON.stringify(args), { signal: combined })
          pending.add(operation)
          try {
            const result = await operation
            combined.throwIfAborted()
            const value: unknown = JSON.parse(result.rawJson)
            return value
          } finally {
            pending.delete(operation)
          }
        },
      })
      inner.tools.register(definition)
    }
    inner.on('tools/execute', async (exec, next) => {
      if (!names.has(exec.name)) return next()
      const upstream = exec.signal
      lease.check()
      exec.signal = AbortSignal.any([upstream, lifetime.signal, lease.signal])
      const operation = Promise.resolve().then(next)
      pending.add(operation)
      try {
        return await operation
      } finally {
        pending.delete(operation)
        exec.signal = upstream
      }
    })
    inner.systemPrompt.section({
      name: 'computer-use:cua-driver-native',
      order: inner.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'),
      text: GUIDANCE,
    })
  }
}
