/** Fixed SSH peer admission and workspace-bound structured file RPCs. @module */
import { Context } from '@deepseek-ai/cordis'
import { DirectSshConnection, type Config, type SshPeer } from '@deepseek-ai/dsh-ssh/direct'
import { targetSchema, policySchema, entriesSchema } from '@deepseek-ai/dsh-ssh/schemas'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { posix } from 'node:path'
import { z } from 'zod'
import type TargetProtection from './index.ts'
import type { TargetConnectionResolution } from './index.ts'
import type { TargetDecision, TargetEffect } from './types.ts'
import { TARGET_REFUSAL_REASONS } from './network-decision.ts'

export type { Config } from '@deepseek-ai/dsh-ssh/direct'

const EFFECTS: Readonly<Record<string, TargetEffect | undefined>> = Object.freeze({
  'helper.start': 'observe', 'fs.resolve': 'observe', 'fs.stat': 'observe', 'fs.lstat': 'observe',
  'fs.list': 'observe', 'fs.readText': 'observe', 'fs.stream': 'observe', 'fs.next': 'observe',
  'fs.readBytes': 'observe', 'fs.readRange': 'observe', 'fs.write': 'mutate', 'fs.edit': 'mutate',
  'fs.remove': 'mutate', 'fs.rename': 'mutate',
})
const CLEANUP = Object.freeze(['close', 'heartbeat', 'fs.streamClose', 'process.terminate'])

function admitted(decision: TargetDecision): void {
  if (!decision.allowed) throw new HarnessError(TARGET_REFUSAL_REASONS[decision.code], decision.code)
}

function within(root: string, path: string): boolean {
  const relative = posix.relative(root, path)
  return relative === '' || (relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative))
}

/** Mandatory target policy around the native SSH connection and every direct helper call. */
export default class ProtectedSshConnection extends DirectSshConnection {
  static override inject = ['credentials', 'targetProtection']
  private readonly protection: TargetProtection
  private peer: TargetConnectionResolution | undefined

  /** @param ctx - Owner providing credentials and target rules. @param config - Explicit endpoint and trusted helper. */
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    this.protection = ctx.targetProtection
  }

  protected override executionSignal(): AbortSignal {
    return AbortSignal.any([super.executionSignal(), this.protection.executionSignal()])
  }

  protected override retainExecution(): () => void { return this.protection.retainExecution() }

  protected override async resolvePeer(signal: AbortSignal): Promise<SshPeer> {
    admitted(await this.protection.checkConnection(this.config.hostname, this.config.port, undefined, 'endpoint', 'observe', signal))
    const resolved = await this.protection.resolveConnectionTarget(this.config.hostname, signal)
    const address = resolved.addresses[0]
    if (address === undefined) throw new HarnessError('SSH target has no verified address.', 'TARGET_IDENTITY_UNVERIFIED')
    // One peer is pinned for this connection; failures do not silently try another address or route.
    this.peer = { ...resolved, addresses: [address] }
    return { address: address.address, family: address.family, revalidate: async (signal) => {
      admitted(await this.protection.checkConnection(this.config.hostname, this.config.port, this.peer, 'endpoint', 'observe', signal))
    } }
  }

  protected override async authorizeRequest(method: string, _params: unknown, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (CLEANUP.includes(method)) return
    const effect = EFFECTS[method]
    if (effect === undefined) {
      // Remote arbitrary code has no target-bounded executor yet; an endpoint label cannot constrain its later effects.
      admitted(this.protection.checkUnconfined())
    }
    admitted(await this.protection.checkConnection(this.config.hostname, this.config.port, this.peer,
      'filesystem', effect ?? 'unconfined', signal))
    signal.throwIfAborted()
  }

  private path(path: string, root: string, cwd = root): string {
    if (path.includes('\0')) throw new HarnessError('SSH file path is invalid.', 'TARGET_IDENTITY_UNVERIFIED')
    const absolute = posix.resolve(cwd, path)
    if (!within(root, absolute) && !within(posix.normalize(this.config.workspace), absolute)) {
      throw new HarnessError('SSH file path is outside the configured workspace.', 'TARGET_EXECUTION_UNCONFINED')
    }
    return absolute
  }

  private async resolved(path: string, root: string, signal?: AbortSignal) {
    const absolute = this.path(path, root)
    const target = await super.request('fs.resolve', { path: absolute, cwd: root }, targetSchema, signal)
    if (!within(root, target.targetKey)) throw new HarnessError('SSH file link leaves the configured workspace.', 'TARGET_EXECUTION_UNCONFINED')
    return target
  }

  private async stableTarget(input: z.infer<typeof targetSchema>, root: string, signal: AbortSignal) {
    const target = await this.resolved(input.targetKey, root, signal)
    if (target.targetKey !== posix.normalize(input.targetKey)) {
      throw new HarnessError('SSH file identity changed; resolve it again.', 'TARGET_IDENTITY_UNVERIFIED')
    }
    if (input.displayPath !== input.targetKey) {
      const display = await this.resolved(input.displayPath, root, signal)
      if (display.targetKey !== target.targetKey) throw new HarnessError('SSH file identity changed; resolve it again.', 'TARGET_IDENTITY_UNVERIFIED')
    }
    return target
  }

  override async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait = false): Promise<T> {
    const remote = await this.ready
    const bounded = AbortSignal.any([this.executionSignal(), ...signal === undefined ? [] : [signal]])
    await this.authorizeRequest(method, params, bounded)
    const root = remote.workspace
    let prepared = params
    if (method === 'fs.resolve' || method === 'fs.lstat') {
      const input = z.object({ path: z.string(), cwd: z.string().optional() }).strict().parse(params)
      const path = this.path(input.path, root, input.cwd ?? root)
      if (method === 'fs.lstat') await this.resolved(path, root, bounded)
      prepared = { path, cwd: root }
    } else if (method === 'fs.rename') {
      const input = z.looseObject({ source: targetSchema, destination: targetSchema, policy: policySchema }).parse(params)
      const source = await this.stableTarget(input.source, root, bounded)
      const destination = await this.stableTarget(input.destination, root, bounded)
      prepared = { ...input, source, destination, policy: { ...input.policy, workspaceRoot: root,
        mode: input.policy.mode === 'read-only' ? 'read-only' : 'workspace-write' } }
    } else if (Object.hasOwn(EFFECTS, method) && method !== 'helper.start' && method !== 'fs.next') {
      const input = z.looseObject({ target: targetSchema }).parse(params)
      const target = await this.stableTarget(input.target, root, bounded)
      prepared = { ...input, target }
      if (EFFECTS[method] === 'mutate') {
        const policy = policySchema.parse(input.policy)
        prepared = { ...input, target, policy: { ...policy, workspaceRoot: root, mode: policy.mode === 'read-only' ? 'read-only' : 'workspace-write' } }
      }
    }
    const value = await super.request(method, prepared, result, bounded, wait)
    bounded.throwIfAborted()
    if (method === 'fs.resolve') {
      const target = targetSchema.parse(value)
      if (!within(root, target.targetKey)) throw new HarnessError('SSH file link leaves the configured workspace.', 'TARGET_EXECUTION_UNCONFINED')
    }
    if (method === 'fs.list' && entriesSchema.parse(value).some(entry => !within(root, entry.target.targetKey))) {
      throw new HarnessError('SSH directory entries leave the configured workspace.', 'TARGET_EXECUTION_UNCONFINED')
    }
    return value
  }
}
