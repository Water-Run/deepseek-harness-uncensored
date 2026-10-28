/** Explicit, pinned SSH transport without local shell commands or ambient OpenSSH configuration. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type CredentialProvider from '@deepseek-ai/dsh-credentials'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { lookup } from 'node:dns/promises'
import { once } from 'node:events'
import { createConnection, isIP, type Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { domainToASCII } from 'node:url'
import ssh2 from 'ssh2'
import type { AuthenticationType, Client, ClientChannel } from 'ssh2'
import { z } from 'zod'
import type { Config as OpenSshConfig, SshService } from './index.ts'
import { helloSchema, type SshStreamEndpoint } from './schemas.ts'
import { SshRpcPeer, SSH_PROTOCOL_VERSION } from './protocol.ts'
import { authenticateStream } from './stream-security.ts'

/** Explicit remote endpoint, trusted helper and credential references; values are never tool arguments. */
export interface Config extends Omit<OpenSshConfig, 'host'> {
  /** DNS name or IP in this client's network; OpenSSH aliases and ProxyCommand are not read. */
  hostname: string
  /** Destination port, default 22. */
  port?: number
  /** SSH account used by the helper. */
  username: string
  /** Required SHA-256 of the server's SSH public-key bytes, as hexadecimal or an OpenSSH SHA256: fingerprint. */
  hostKeySha256: string
  /** Credential reference containing a private key; at least one authentication reference is required. */
  privateKeyRef?: string
  /** Credential reference containing the private-key passphrase; requires privateKeyRef. */
  passphraseRef?: string
  /** Credential reference containing the account password. */
  passwordRef?: string
}

type Hello = z.infer<typeof helloSchema>
type ResolvedConfig = z.infer<typeof validation>

/** Resolved literal destination and its executor-owned final admission check. */
export interface SshPeer {
  /** Literal address actually passed to the TCP connector. */
  address: string
  /** Address family of that literal. */
  family: 4 | 6
  /** Recheck current policy after credential resolution, before the first connection. */
  revalidate: (signal: AbortSignal) => Promise<void>
}

const remotePath = z.string().startsWith('/').refine(value => !/[\0\r\n]/u.test(value), 'remote paths must not contain control characters')
const ref = z.string().refine(isCredentialRefName, 'SSH authentication requires a credential reference name.').transform(credentialRef)
const fingerprint = z.string().trim().transform((value, ctx) => {
  if (/^[a-f0-9]{64}$/iu.test(value)) return value.toLowerCase()
  if (/^SHA256:[A-Za-z0-9+/]{43}=?$/u.test(value)) {
    const encoded = value.slice(7).replace(/=$/u, ''), bytes = Buffer.from(encoded, 'base64')
    if (bytes.length === 32 && bytes.toString('base64').replace(/=$/u, '') === encoded) return bytes.toString('hex')
  }
  ctx.addIssue({ code: 'custom', message: 'SSH requires a verified SHA-256 host fingerprint.' })
  return z.NEVER
})
const validation = z.object({
  hostname: z.string().min(1), port: z.number().int().min(1).max(65535), username: z.string().min(1).regex(/^[^\0\r\n]+$/u),
  hostKeySha256: fingerprint,
  privateKeyRef: ref.optional(), passphraseRef: ref.optional(), passwordRef: ref.optional(),
  launch: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('node-script'), node: remotePath,
      bootstrapPath: remotePath.optional(), bootstrapHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    }).strict().refine(value => (value.bootstrapPath === undefined) === (value.bootstrapHash === undefined), 'bootstrapPath and hash must be paired'),
    z.object({ kind: z.literal('executable') }).strict(),
  ]),
  helper: remotePath, helperHash: z.string().regex(/^[a-f0-9]{64}$/u), workspace: remotePath,
  requestTimeoutMs: z.number().int().positive().max(2147483647), maxFrameBytes: z.number().int().positive().max(67108864),
  maxPending: z.number().int().positive().max(128), leaseMs: z.number().int().min(3000).max(600000),
}).strict().refine(value => value.privateKeyRef !== undefined || value.passwordRef !== undefined, 'configure an authentication reference')
  .refine(value => value.passphraseRef === undefined || value.privateKeyRef !== undefined, 'passphraseRef requires privateKeyRef')

/** Cross-platform client for the installed POSIX helper; no agent forwarding or automatic host-key acceptance. */
export class DirectSshConnection extends Service implements SshService {
  static inject = ['credentials']
  static Config: schema<Config> = schema.object({
    hostname: schema.string().required(), port: schema.natural().default(22), username: schema.string().required(),
    hostKeySha256: schema.string().required(), privateKeyRef: schema.string(), passwordRef: schema.string(), passphraseRef: schema.string(),
    helper: schema.string().required(), helperHash: schema.string().required(), workspace: schema.string().required(),
    launch: schema.union([
      schema.object({ kind: schema.const('node-script').required(), node: schema.string().required(),
        bootstrapPath: schema.string(), bootstrapHash: schema.string() }),
      schema.object({ kind: schema.const('executable').required() }),
    ]).required(),
    requestTimeoutMs: schema.number().default(30000), maxFrameBytes: schema.number().default(67108864),
    maxPending: schema.number().default(128), leaseMs: schema.number().default(30000),
  })

  protected readonly config: ResolvedConfig
  private readonly credentials: CredentialProvider
  private readonly readyState = Promise.withResolvers<Hello>()
  /** Resolves after authentication, helper identity and workspace validation; rejects when activation fails. */
  readonly ready = this.readyState.promise
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  private readonly streams = new Map<Duplex, { closed: Promise<void>; drain: boolean }>()
  private client: Client | undefined
  private rpc: SshRpcPeer | undefined
  private remote: Hello | undefined
  private failure: Error | undefined
  private closing = false
  private disposal: Promise<void> | undefined
  private heartbeat: NodeJS.Timeout | undefined
  private releaseOwner: (() => void) | undefined
  private detachPolicy: (() => void) | undefined

  /** @param ctx - Owner with the credential provider. @param config - Deployment configuration after schema defaults. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'ssh')
    const parsed = validation.parse(config)
    const hostname = isIP(parsed.hostname) === 0 ? domainToASCII(parsed.hostname).toLowerCase() : parsed.hostname
    if (hostname === '' || /[\s/@?#\\]/u.test(hostname)) throw new Error('SSH hostname must be a DNS name or literal IP.')
    this.config = { ...parsed, hostname }
    this.credentials = ctx.credentials
    void this.ready.catch(() => {}) // Activation reports the failure; awaiting consumers also receive it.
    const owner = ctx.fiber
    ctx.on('internal/plugin', (fiber) => {
      // Fiber teardown waits for activation; cancel native startup at the earlier withdrawal notification.
      if (fiber !== owner || fiber.uid !== null) return
      if (this.remote === undefined) this.fail(new HarnessError('SSH provider was withdrawn.', 'SSH_UNAVAILABLE'))
      else this.closing = true
    })
    ctx.effect(() => () => this.dispose(), 'ssh-direct.lifetime')
  }

  /** Activate only after subclass state and mandatory services exist. */
  async [Service.init](): Promise<void> {
    try {
      this.assertOpen()
      this.releaseOwner = this.retainExecution()
      const signal = this.executionSignal()
      const revoked = (): void => { this.fail(new HarnessError('SSH execution permission was withdrawn.', 'SSH_UNAVAILABLE')) }
      signal.addEventListener('abort', revoked, { once: true })
      this.detachPolicy = () => { signal.removeEventListener('abort', revoked) }
      signal.throwIfAborted()
      const remote = await this.track(this.start(signal))
      this.assertOpen()
      this.remote = remote
      this.readyState.resolve(remote)
      this.startHeartbeat()
    } catch (error) {
      const failure = this.fail(error)
      this.readyState.reject(failure)
      await this.dispose()
      throw failure
    }
  }

  /** @returns The current executor lifetime; protected adapters add policy revocation. */
  protected executionSignal(): AbortSignal { return this.lifetime.signal }
  /** @returns A dependency lease held until all native SSH activity has settled. */
  protected retainExecution(): () => void { return () => {} }

  /** @param signal - Activation cancellation. @returns One literal peer with a final policy recheck. */
  protected async resolvePeer(signal: AbortSignal): Promise<SshPeer> {
    signal.throwIfAborted()
    const addresses = await lookup(this.config.hostname, { all: true, order: 'verbatim' })
    signal.throwIfAborted()
    const first = addresses[0]
    if (first === undefined || (first.family !== 4 && first.family !== 6)) throw new HarnessError('SSH target did not resolve.', 'SSH_UNAVAILABLE')
    return { address: first.address, family: first.family, revalidate: (signal) => { signal.throwIfAborted(); return Promise.resolve() } }
  }

  /**
   * Check an actual helper request; protected adapters enforce effects here, including direct service callers.
   * @param method - Exact protocol operation; helper.start is the fixed helper launch.
   * @param params - Operation arguments, validated by the remote helper before execution.
   * @param signal - Current operation deadline and cancellation.
   * @returns Completion only when the operation is admitted.
   */
  protected authorizeRequest(method: string, params: unknown, signal: AbortSignal): Promise<void> {
    void method; void params; signal.throwIfAborted(); return Promise.resolve()
  }

  private assertOpen(): void {
    if (this.failure !== undefined) throw this.failure
    if (this.closing) throw new HarnessError('SSH connection is closed.', 'SSH_UNAVAILABLE')
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation)
    return operation.finally(() => { this.operations.delete(operation) })
  }

  private own<T extends Duplex>(stream: T, drain = false): T {
    stream.on('error', () => {}) // The operation or stream consumer owns reporting; close-before-handoff is rejected below.
    const closed = new Promise<void>((resolve) => { if (stream.closed) resolve(); else stream.once('close', () => { resolve() }) })
    this.streams.set(stream, { closed, drain })
    void closed.then(() => { this.streams.delete(stream) })
    return stream
  }

  private closeStreams(): void {
    for (const [stream, record] of this.streams) {
      stream.destroy()
      // ssh2 channels emit close after their readable end; destroy() alone does not consume an unopened channel.
      if (record.drain) stream.resume()
    }
  }

  private fail(error: unknown): Error {
    this.failure ??= error instanceof HarnessError ? error
      : new HarnessError('SSH connection failed; remote outcomes may be unknown. Check the endpoint and credentials before retrying.',
        'SSH_CONNECTION_FAILED', { cause: error })
    this.lifetime.abort(this.failure)
    this.rpc?.close(this.failure)
    this.client?.destroy()
    this.closeStreams()
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
    return this.failure
  }

  private async secret(name: string | undefined): Promise<string | undefined> {
    if (name === undefined) return undefined
    const value = await this.credentials.resolve(credentialRef(name))
    if (value === undefined) throw new HarnessError('SSH credential reference is not configured.', 'SSH_CREDENTIAL_UNAVAILABLE')
    return value.value
  }

  private async start(signal: AbortSignal): Promise<Hello> {
    using timeout = deadline(signal, this.config.requestTimeoutMs, 'SSH_START_TIMEOUT')
    const peer = await this.resolvePeer(timeout.signal)
    if (isIP(peer.address) !== peer.family) throw new HarnessError('SSH resolver did not provide a literal target.', 'SSH_IDENTITY_UNVERIFIED')
    const privateKey = await this.secret(this.config.privateKeyRef), passphrase = await this.secret(this.config.passphraseRef)
    const password = await this.secret(this.config.passwordRef)
    if (privateKey !== undefined && ssh2.utils.parseKey(privateKey, passphrase) instanceof Error) {
      throw new HarnessError('SSH private key or passphrase is invalid.', 'SSH_CREDENTIAL_UNAVAILABLE')
    }
    await peer.revalidate(timeout.signal)
    timeout.signal.throwIfAborted()
    const socket = this.own(createConnection({ host: peer.address, port: this.config.port, family: peer.family }))
    const abort = (): void => { socket.destroy() }
    timeout.signal.addEventListener('abort', abort, { once: true })
    try {
      await once(socket, 'connect', { signal: timeout.signal })
      const client = new ssh2.Client(); this.client = client
      client.on('error', (error) => { this.fail(error) })
      client.on('close', () => { this.fail(new HarnessError('SSH disconnected; remote outcomes and cleanup may be unknown.', 'SSH_CONNECTION_CLOSED')) })
      const ready = once(client, 'ready', { signal: timeout.signal })
      try {
        const authHandler: AuthenticationType[] = []
        if (privateKey !== undefined) authHandler.push('publickey')
        if (password !== undefined) authHandler.push('password')
        client.connect({ sock: socket, username: this.config.username, authHandler,
          ...privateKey === undefined ? {} : { privateKey }, ...passphrase === undefined ? {} : { passphrase },
          ...password === undefined ? {} : { password },
          hostHash: 'sha256', hostVerifier: (hash: string) => {
            if (hash === this.config.hostKeySha256) return true
            this.failure = new HarnessError('SSH server key differs from the configured fingerprint.', 'SSH_IDENTITY_MISMATCH')
            return false
          }, readyTimeout: this.config.requestTimeoutMs, keepaliveInterval: 0, tryKeyboard: false, agentForward: false,
        })
      } catch (error) { this.fail(error) }
      await ready
      await this.authorizeRequest('helper.start', { helper: this.config.helper, workspace: this.config.workspace }, timeout.signal)
      const channel = await this.execHelper(client, timeout.signal)
      const rpc = new SshRpcPeer(channel, channel, this.config.maxFrameBytes, this.config.maxPending)
      this.rpc = rpc
      rpc.once('closed', (error) => { this.fail(error) })
      const launch = this.config.launch
      const remote = await rpc.request('hello', { protocol: SSH_PROTOCOL_VERSION, workspace: this.config.workspace, leaseMs: this.config.leaseMs,
        ...launch.kind === 'node-script' && launch.bootstrapPath !== undefined ? { bootstrapPath: launch.bootstrapPath } : {},
      }, helloSchema, timeout.signal)
      if (remote.hash !== this.config.helperHash || remote.kind !== launch.kind
        || remote.bootstrapHash !== (launch.kind === 'node-script' ? launch.bootstrapHash : undefined)) {
        throw new HarnessError('SSH helper identity differs from the configured artifact.', 'SSH_IDENTITY_MISMATCH')
      }
      return remote
    } finally { timeout.signal.removeEventListener('abort', abort) }
  }

  private helperCommand(): string {
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
    const launch = this.config.launch
    const command = launch.kind === 'node-script'
      ? [launch.node, '--disable-sigusr1', this.config.helper].map(quote).join(' ')
      : `env NODE_OPTIONS=--disable-sigusr1 ${quote(this.config.helper)}`
    return `if command -v sha256sum >/dev/null 2>&1; then h=$(sha256sum < ${quote(this.config.helper)}); else h=$(shasum -a 256 < ${quote(this.config.helper)}); fi; [ "\${h%% *}" = ${quote(this.config.helperHash)} ] || exit 78; exec ${command}`
  }

  private async execHelper(client: Client, signal: AbortSignal): Promise<ClientChannel> {
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      client.exec(this.helperCommand(), (error, stream) => {
        if (error !== undefined) { reject(error); return }
        const channel = this.own(stream, true)
        channel.stderr.resume()
        channel.once('exit', (code: number | null) => {
          if (code === 78 && this.remote === undefined) {
            this.fail(new HarnessError('SSH helper checksum could not be verified; check the installed artifact and digest.', 'SSH_IDENTITY_MISMATCH'))
          }
        })
        if (signal.aborted || this.closing) { channel.destroy(); reject(new HarnessError('SSH helper launch cancelled.', 'SSH_UNAVAILABLE')) }
        else resolve(channel)
      })
    })
    signal.throwIfAborted()
    return channel
  }

  private startHeartbeat(): void {
    let pending = false
    this.heartbeat = setInterval(() => {
      if (pending || this.closing) return
      pending = true
      void this.sendHeartbeat().catch((error: unknown) => { this.fail(error) }).finally(() => { pending = false })
    }, Math.floor(this.config.leaseMs / 3))
    this.heartbeat.unref()
  }

  private async sendHeartbeat(): Promise<void> {
    using timeout = deadline(this.executionSignal(), this.config.leaseMs / 2, 'SSH_HEARTBEAT_TIMEOUT')
    await this.request('heartbeat', {}, z.null(), timeout.signal)
  }

  /** Verified helper launch parameters for PTC consumers. */
  get ptcLaunch(): SshService['ptcLaunch'] {
    this.assertOpen()
    if (this.remote === undefined) throw new HarnessError('SSH helper is not ready.', 'SSH_UNAVAILABLE')
    const launch = this.config.launch
    if (launch.kind === 'executable') return { kind: 'embedded', executable: this.remote.executable }
    if (launch.bootstrapPath === undefined) throw new HarnessError('SSH PTC requires a verified bootstrap.', 'SSH_UNAVAILABLE')
    return { kind: 'node-script', executable: this.remote.executable, bootstrapPath: launch.bootstrapPath }
  }

  /**
   * Send an admitted helper request without reconnecting or replaying an ambiguous mutation.
   * @param method - Exact protocol operation.
   * @param params - Arguments validated by the helper.
   * @param result - Expected response parser.
   * @param signal - Caller cancellation; omission still observes connection disposal.
   * @param wait - Allows process observation beyond the administrative timeout.
   * @returns The validated response.
   */
  async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait = false): Promise<T> {
    return this.track(this.requestOnce(method, params, result, signal, wait))
  }

  private async requestOnce<T>(
    method: string, params: unknown, result: z.ZodType<T>, signal: AbortSignal | undefined, wait: boolean,
  ): Promise<T> {
    this.assertOpen(); await this.ready; this.assertOpen()
    const combined = AbortSignal.any([this.executionSignal(), ...signal === undefined ? [] : [signal]])
    using timeout = deadline(combined, wait ? 0 : this.config.requestTimeoutMs, 'SSH_REQUEST_TIMEOUT')
    await this.authorizeRequest(method, params, timeout.signal)
    timeout.signal.throwIfAborted(); this.assertOpen()
    return await (this.rpc as SshRpcPeer).request(method, params, result, timeout.signal)
  }

  /**
   * Connect only to a helper-issued Unix stream and authenticate its independent capability.
   * @param endpoint - Private helper coordinates received over the authenticated RPC channel.
   * @param signal - Caller cancellation; cancelling an unacknowledged allocation closes the connection.
   * @returns A paused authenticated socket, compatible with the existing process consumers.
   */
  async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket> {
    return this.track(this.openStream(endpoint, signal))
  }

  private async openStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket> {
    this.assertOpen(); const remote = await this.ready; this.assertOpen()
    const combined = AbortSignal.any([this.executionSignal(), ...signal === undefined ? [] : [signal]])
    using timeout = deadline(combined, this.config.requestTimeoutMs, 'SSH_STREAM_TIMEOUT')
    const path = endpoint.path
    if (!path.startsWith(`${remote.root}/`) || path.split('/').some(part => part === '..') || /[\0\r\n]/u.test(path)) {
      throw new HarnessError('SSH helper returned an invalid stream path.', 'SSH_IDENTITY_UNVERIFIED')
    }
    await this.authorizeRequest('stream.connect', endpoint, timeout.signal)
    timeout.signal.throwIfAborted()
    const aborted = (): void => { this.fail(new HarnessError('SSH stream allocation was cancelled; the connection was closed.', 'SSH_UNAVAILABLE')) }
    timeout.signal.addEventListener('abort', aborted, { once: true })
    try {
      const channel = await new Promise<ClientChannel>((resolve, reject) => {
        ;(this.client as Client).openssh_forwardOutStreamLocal(path, (error, stream) => {
          if (error !== undefined) { reject(error); return }
          const channel = this.own(stream, true)
          if (timeout.signal.aborted || this.closing) { channel.destroy(); reject(new HarnessError('SSH stream cancelled.', 'SSH_UNAVAILABLE')) }
          else resolve(channel)
        })
      })
      const socket = this.own(await authenticateStream(channel, endpoint.capability, this.config.requestTimeoutMs, timeout.signal))
      this.assertOpen(); timeout.signal.throwIfAborted()
      if (socket.destroyed) throw new HarnessError('SSH stream closed before handoff.', 'SSH_UNAVAILABLE')
      return socket
    } finally { timeout.signal.removeEventListener('abort', aborted) }
  }

  /** Stop admission, request remote cleanup, then settle native streams before releasing dependencies. */
  dispose(): Promise<void> { return this.disposal ??= this.close() }

  private async close(): Promise<void> {
    this.closing = true
    this.detachPolicy?.()
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
    try {
      if (this.remote !== undefined && this.failure === undefined && this.rpc !== undefined) {
        using timeout = deadline(undefined, this.config.requestTimeoutMs, 'SSH_CLOSE_TIMEOUT')
        await this.rpc.request('close', {}, z.null(), timeout.signal)
      }
    } finally {
      const reason = this.failure ?? new HarnessError('SSH connection is closed.', 'SSH_UNAVAILABLE')
      this.lifetime.abort(reason); this.readyState.reject(reason); this.rpc?.close(reason); this.client?.destroy()
      this.closeStreams()
      while (this.operations.size > 0) await Promise.allSettled([...this.operations])
      await Promise.allSettled([...this.streams.values()].map(record => record.closed))
      this.releaseOwner?.(); this.releaseOwner = undefined
    }
  }
}

export default DirectSshConnection
