/** Execution admission for dynamic Host and Client plugins. @module */
import { Context } from '@deepseek-ai/cordis'
import DynamicCordisRunner, { type Config } from '@deepseek-ai/dsh-cordis-host-runner'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type TargetProtection from './index.ts'

/** Rejects dynamic code whose effects can outlive a policy change or escape the Host VM. */
export default class TargetDynamicCordis extends DynamicCordisRunner {
  static override inject = [...DynamicCordisRunner.inject, 'targetProtection']
  private readonly protection: TargetProtection

  /**
   * @param ctx - Owner with the mandatory target-rule service.
   * @param config - Existing dynamic-runner limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.protection = ctx.targetProtection
  }

  protected override assertExecutionAllowed(): void {
    this.protection.executionSignal().throwIfAborted()
    throw new HarnessError('Dynamic Host and Client plugins cannot isolate target or configuration effects. Use a guarded structured operation; full-access or Client approval cannot override this protection.', 'TARGET_DYNAMIC_UNCONFINED')
  }
}
