/** Local process provider that refuses arbitrary code while target effects cannot be bounded. @module */
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessSpawnSpec, SubprocessHandle, SubprocessTerminalSpawnSpec, SubprocessTerminalHandle } from '@deepseek-ai/dsh-subprocess'
import type TargetProtection from '@deepseek-ai/dsh-target-protection'
import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Replaces subprocess-local; test host labels and full-access approvals do not confine arbitrary code. */
export default class TargetSubprocess extends LocalSubprocessRuntime {
  static inject = ['targetProtection']
  private readonly protection: TargetProtection

  /**
   * @param ctx - Composition containing the mandatory target-rule service.
   */
  constructor(ctx: Context) {
    super(ctx)
    this.protection = ctx.targetProtection
  }

  private admitted(signal?: AbortSignal): AbortSignal {
    const bounded = AbortSignal.any([this.protection.executionSignal(), ...signal === undefined ? [] : [signal]])
    bounded.throwIfAborted()
    const result = this.protection.checkUnconfined()
    if (!result.allowed) throw new HarnessError('This process cannot constrain network and file effects to the permitted targets. Use a guarded structured operation.', result.code)
    bounded.throwIfAborted()
    return bounded
  }

  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    return super.spawn({ ...spec, signal: this.admitted(spec.signal) })
  }

  override async spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return super.spawnTerminal({ ...spec, signal: this.admitted(spec.signal) })
  }
}
