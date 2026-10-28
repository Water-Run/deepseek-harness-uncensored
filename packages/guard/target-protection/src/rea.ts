/** Mandatory execution admission for REA's direct native MCP process. @module */
import { Context } from '@deepseek-ai/cordis'
import ReaService, { type ReaExecutionLease } from '@deepseek-ai/dsh-rea'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type TargetProtection from './index.ts'

/** Replaces the REA root owner; native engines cannot use tool declarations as proof of bounded effects. */
export default class TargetRea extends ReaService {
  static inject = ['targetProtection']
  private readonly protection: TargetProtection

  /** @param ctx - Owner providing mandatory target rules. @param config - Existing REA launch preferences. */
  constructor(ctx: Context, config: ConstructorParameters<typeof ReaService>[1]) {
    super(ctx, config)
    this.protection = ctx.targetProtection
  }

  protected override acquireExecution(): ReaExecutionLease {
    const signal = this.protection.executionSignal()
    const check = (): void => {
      signal.throwIfAborted()
      const decision = this.protection.checkUnconfined()
      if (!decision.allowed) throw new HarnessError(
        'REA engines cannot constrain their file and network effects to the permitted targets. Use a guarded structured operation.', decision.code)
    }
    check()
    return { signal, check, release: this.protection.retainExecution() }
  }
}
