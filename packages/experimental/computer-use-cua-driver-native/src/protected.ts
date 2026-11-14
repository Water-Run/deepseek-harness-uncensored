/** Opt-in target admission for the in-process Cua Driver native runtime. @module */
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-target-protection'
import { mountNativeComputerUse } from './native.ts'

export { Config } from './index.ts'

/** Distinct composition entry; the ordinary native provider remains unchanged. */
export const name = 'target-protected-computer-use-cua-driver-native'

/** Required target owner cannot disappear without withdrawing this consumer. */
export const inject = ['computerUse', 'tools', 'systemPrompt', 'targetProtection']

/**
 * Reject unconstrained desktop effects before creating a native runtime or dispatching calls.
 * @param ctx - Host with the mandatory target owner and ordinary Cua Driver services.
 * @returns Catalog activation only when the current target policy permits unconfined effects.
 */
export async function apply(ctx: Context): Promise<void> {
  const protection = ctx.targetProtection
  const signal = protection.executionSignal()
  const check = (): void => {
    signal.throwIfAborted()
    const decision = protection.checkUnconfined()
    if (!decision.allowed) throw new HarnessError(
      'Computer use cannot constrain file and network effects to the permitted targets. Use a guarded structured operation.', decision.code)
  }
  check()
  await mountNativeComputerUse(ctx, { signal, check, release: protection.retainExecution() })
}
