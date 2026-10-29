/** Owner-authenticated profile management under target protection. @module */
import { Context } from '@deepseek-ai/cordis'
import PluginManager, { type Config } from '@deepseek-ai/dsh-plugin-manager'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type TargetProtection from './index.ts'

/** Retains local discovery while requiring a live owner Remote call for persistent or executable operations. */
export default class TargetPluginManager extends PluginManager {
  static override inject = [...PluginManager.inject, 'targetProtection']
  private readonly protection: TargetProtection

  /**
   * @param ctx - Profile owner with the mandatory target-rule service.
   * @param config - Existing plugin-manager process and registry limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.protection = ctx.targetProtection
  }

  protected override assertManagementAllowed(): void {
    this.protection.executionSignal().throwIfAborted()
    const invocation = this.ctx.invocation
    if (invocation?.peer.principal.kind !== 'owner') throw new HarnessError(
      'Protected plugin changes and package lookups require the authenticated application owner. Use the plugin settings; model full-access approval does not grant profile ownership.', 'TARGET_MANAGEMENT_OWNER_REQUIRED')
    invocation.signal.throwIfAborted()
    invocation.peer.signal.throwIfAborted()
  }
}
