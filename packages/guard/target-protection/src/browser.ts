/** Mandatory execution admission for Session-owned native and MCP browsers. @module */
import { Context } from '@deepseek-ai/cordis'
import BrowserUseRegistry, { type BrowserExecutionLease } from '@deepseek-ai/dsh-browser-use'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type TargetProtection from './index.ts'

/** Replaces the browser registry; all shipped browser providers acquire its execution leases. */
export default class TargetBrowserUse extends BrowserUseRegistry {
  static inject = ['targetProtection']
  private readonly protection: TargetProtection

  /** @param ctx - Owner providing the mandatory target-rule service. */
  constructor(ctx: Context) {
    super(ctx)
    this.protection = ctx.targetProtection
  }

  override acquireExecution(): BrowserExecutionLease {
    const signal = this.protection.executionSignal()
    const check = (): void => {
      signal.throwIfAborted()
      const decision = this.protection.checkUnconfined()
      if (!decision.allowed) throw new HarnessError(
        'This browser cannot constrain its file and network effects to the permitted targets. Use a guarded structured operation.', decision.code)
    }
    check()
    return { signal, check, release: this.protection.retainExecution() }
  }
}
