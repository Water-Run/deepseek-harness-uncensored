/** Mandatory target admission around the complete MCP connection supervisor. @module */
import type { Context } from '@deepseek-ai/cordis'
import { mountMcpClient, type Config } from '@deepseek-ai/dsh-mcp-client'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type {} from './index.ts'

export { Config } from '@deepseek-ai/dsh-mcp-client'
/** Cordis provider name. */
export const name = 'target-protected-mcp'
/** Both dependencies remain mandatory for the provider lifetime. */
export const inject = ['tools', 'targetProtection']

/**
 * Connect only when the executor can admit an unconfined external server.
 * @param ctx - Owner providing tools and durable protection.
 * @param config - Existing MCP settings; server annotations never authorize effects.
 * @returns Initial readiness, or rejection before a protected native/HTTP connection starts.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const protection = ctx.targetProtection
  const signal = protection.executionSignal()
  const check = (): void => {
    signal.throwIfAborted()
    const decision = protection.checkUnconfined()
    if (!decision.allowed) throw new HarnessError(
      'This MCP server cannot constrain its effects to the permitted targets. Use a guarded structured operation.', decision.code)
  }
  check()
  await mountMcpClient(ctx, config, { signal, check, release: protection.retainExecution() })
}
