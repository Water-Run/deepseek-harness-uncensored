/** Fixed SSH peer admission and workspace-bound structured file RPCs. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import { addAbortListener } from 'node:events'
import { DirectSshConnection, type Config as DirectConfig, type SshPeer } from '@deepseek-ai/dsh-ssh/direct'
import schema from '@deepseek-ai/schemastery'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type CredentialProvider from '@deepseek-ai/dsh-credentials'
import { connectThrough } from '@deepseek-ai/dsh-security-proxy-local'
import { targetSchema, policySchema, entriesSchema, remoteFileProtectionSchema } from '@deepseek-ai/dsh-ssh/schemas'
import { RemoteOperationError, type SshRpcPeer } from '@deepseek-ai/dsh-ssh/protocol'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { posix } from 'node:path'
import { isIP, type Socket } from 'node:net'
import { domainToASCII } from 'node:url'
import { z } from 'zod'
import type TargetProtection from './index.ts'
import type { TargetConnectionResolution } from './index.ts'
import type { TargetDecision, TargetEffect } from './types.ts'
import { TARGET_REFUSAL_REASONS } from './network-decision.ts'

/** Owner-selected SSH route, independent of ambient proxy variables and model arguments. */
export interface Config extends DirectConfig {
  /** Production paths interpreted by the verified remote Linux helper. */
  protectedPaths?: z.input<typeof remoteFileProtectionSchema>
  /** Omit for direct TCP. The configured proxy must be trusted to honor the literal CONNECT destination. */
  proxy?: {
    /** Transport to the proxy; HTTPS keeps the system certificate verification. */
    protocol: 'http' | 'https'
    /** Trusted proxy hostname or unbracketed IP. */
    host: string
    /** Explicit proxy service port. */
    port: number
    /** Basic-auth user name; omitted when proxy authentication is disabled. */
    username?: string
    /** Stored proxy password; must be paired with a nonempty username. */
    passwordRef?: string
  } | undefined
}

const proxyValidation = z.object({
  protocol: z.enum(['http', 'https']),
  host: z.string().transform(value => isIP(value) === 0 ? domainToASCII(value).toLowerCase() : value)
    .refine(value => value !== '' && !/[\s/@?#\\[\]]/u.test(value), 'Proxy host must be a DNS name or literal IP.'),
  port: z.number().int().min(1).max(65535),
  username: z.string().regex(/^[^\r\n:]*$/u).default(''),
  passwordRef: z.string().refine(isCredentialRefName, 'Use a stored credential reference.').transform(credentialRef).optional(),
}).strict().refine(value => (value.username !== '') === (value.passwordRef !== undefined), 'Proxy username and password reference must be paired')

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
  static override Config: schema<Config> = schema.intersect([DirectSshConnection.Config, schema.object({
    protectedPaths: schema.array(schema.object({
      path: schema.string().required(), protection: schema.union(['full', 'audit']).required(),
    })).default([]),
    proxy: schema.union([schema.const(undefined), schema.object({
      protocol: schema.union(['http', 'https']).required(), host: schema.string().required(),
      port: schema.natural().required(), username: schema.string(), passwordRef: schema.string(),
    })]),
  })])
  private readonly protection: TargetProtection
  private readonly proxy: z.infer<typeof proxyValidation> | undefined
  private readonly proxyCredentials: CredentialProvider
  private readonly protectedPaths: z.output<typeof remoteFileProtectionSchema>
  private peer: TargetConnectionResolution | undefined
  private withdrawCoverage: (() => void) | undefined

  /** @param ctx - Owner providing credentials and target rules. @param config - Explicit endpoint and trusted helper. */
  constructor(ctx: Context, config: Config) {
    const { proxy, protectedPaths = [], ...direct } = config
    super(ctx, direct)
    this.protection = ctx.targetProtection
    this.proxy = proxy === undefined ? undefined : proxyValidation.parse(proxy)
    this.proxyCredentials = ctx.credentials
    this.protectedPaths = remoteFileProtectionSchema.parse(protectedPaths)
  }

  /** Publish coverage after peer and helper verification have completed. */
  override async [Service.init](): Promise<void> {
    await super[Service.init]()
    const signal = this.executionSignal()
    signal.throwIfAborted()
    this.ctx.effect(() => {
      const withdraw = this.protection.registerSshCoverage(this.protectedPaths.length > 0)
      this.withdrawCoverage = withdraw
      const aborted = addAbortListener(signal, withdraw)
      return () => { aborted[Symbol.dispose](); withdraw() }
    }, 'target-protected-ssh.coverage')
  }

  /**
   * Withdraw reported coverage before closing the verified SSH connection.
   * @returns Completion after the connection and its operations close.
   */
  override dispose(): Promise<void> {
    this.withdrawCoverage?.()
    return super.dispose()
  }

  protected override async configureHelper(peer: SshRpcPeer, signal: AbortSignal): Promise<void> {
    if (this.protectedPaths.length === 0) return
    try { await peer.request('fs.protection', this.protectedPaths, z.null(), signal) }
    catch (error) {
      signal.throwIfAborted()
      throw new HarnessError('SSH helper could not verify remote file protection. Check the helper version and paths.',
        'TARGET_IDENTITY_UNVERIFIED', { cause: error })
    }
  }

  protected override executionSignal(): AbortSignal {
    return AbortSignal.any([super.executionSignal(), this.protection.executionSignal()])
  }

  protected override retainExecution(): () => void { return this.protection.retainExecution() }

  protected override async connectPeer(peer: SshPeer, signal: AbortSignal): Promise<Socket> {
    if (this.proxy === undefined) return super.connectPeer(peer, signal)
    const proxy = this.proxy
    const secret = proxy.passwordRef === undefined ? undefined : await this.proxyCredentials.resolve(proxy.passwordRef)
    if (proxy.passwordRef !== undefined && secret === undefined) {
      throw new HarnessError('SSH proxy credential is not configured.', 'SSH_CREDENTIAL_UNAVAILABLE')
    }
    await peer.revalidate(signal)
    signal.throwIfAborted()
    const tunnel = await connectThrough({ ...proxy, password: secret?.value }, peer.address, this.config.port,
      this.config.requestTimeoutMs, signal)
    const socket = this.ownTransport(tunnel.socket)
    signal.throwIfAborted()
    await peer.revalidate(signal)
    return socket
  }

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
    if (method === 'fs.protection' || (this.protectedPaths.length > 0 && effect === undefined)) {
      throw new HarnessError('This SSH operation cannot be confined to the protected remote filesystem.', 'TARGET_EXECUTION_UNCONFINED')
    }
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
    const target = await this.requestHelper('fs.resolve', { path: absolute, cwd: root }, targetSchema, signal)
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
    return this.protectedPaths.length > 0 ? { ...target, displayPath: input.displayPath } : target
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
    const value = await this.requestHelper(method, prepared, result, bounded, wait)
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

  private async requestHelper<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait = false): Promise<T> {
    try { return await super.request(method, params, result, signal, wait) }
    catch (error) {
      if (error instanceof RemoteOperationError && error.code !== undefined && Object.hasOwn(TARGET_REFUSAL_REASONS, error.code)) {
        throw new HarnessError(error.message, error.code, { cause: error })
      }
      throw error
    }
  }
}
