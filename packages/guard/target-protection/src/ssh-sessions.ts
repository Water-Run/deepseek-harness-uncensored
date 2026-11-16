/** Deployment SSH metadata with separate, retained connections for exact live Agents. @module */
import { Context, Service, type Fiber } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SshService } from '@deepseek-ai/dsh-ssh'
import type { SshPeer } from '@deepseek-ai/dsh-ssh/direct'
import type { SecurityProxyEgressLease } from '@deepseek-ai/dsh-security-proxy'
import { connectThrough } from '@deepseek-ai/dsh-security-proxy-local'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { Socket } from 'node:net'
import type TargetProtection from './index.ts'
import ProtectedSshConnection, { type Config as ConnectionConfig } from './ssh.ts'

/** The fixed deployment endpoint is shared; each Agent owns an independent verified connection. */
export interface Config extends ConnectionConfig {
  /** Maximum simultaneously retained Agent connections, default 16; unconfirmed shutdown still occupies capacity. */
  maxSessions?: number
}

type ResolvedConfig = ConnectionConfig & { maxSessions: number }

interface Binding {
  readonly agent: Agent
  readonly proxied: boolean
  readonly service: SshService
  start(): void
  close(): Promise<void>
}

/** Optional session routing; Host operations retain the separately initialized deployment connection. */
export default class SessionSshConnection extends ProtectedSshConnection {
  static override inject = ['credentials', 'targetProtection', 'agents', 'sessions', 'securityProxy']
  static override Config: schema<Config, ResolvedConfig> = schema.intersect([ProtectedSshConnection.Config, schema.object({
    maxSessions: schema.natural().min(1).max(1024).default(16),
  })])
  private readonly policyOwner: TargetProtection
  private readonly poolOwner: { readonly ctx: Context }
  private readonly connectionConfig: ConnectionConfig
  private readonly capacity: number
  private readonly bindings = new WeakMap<Agent, Binding>()
  private readonly live = new Set<Binding>()
  private poolClosed = false
  private poolDisposal: Promise<void> | undefined

  /** @param ctx - Owner of live Agent, Session, target and proxy services. @param config - Validated deployment configuration. */
  constructor(ctx: Context, config: Config) {
    const { maxSessions, ...connection } = SessionSshConnection.Config(config)
    super(ctx, connection)
    this.policyOwner = ctx.targetProtection
    this.poolOwner = { ctx }
    this.connectionConfig = connection
    this.capacity = maxSessions
    ctx.on('agent/disposed', ({ agent }) => {
      const binding = this.bindings.get(agent)
      if (binding !== undefined) this.stop([binding])
    })
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'agent-preset/selected') return
      this.stop([...this.live].filter(binding => binding.agent.session === session))
    })
    ctx.on('security-proxy/transport-changed', () => {
      this.stop([...this.live].filter(binding => binding.proxied || ctx.securityProxy.route(binding.agent, 'ssh') !== undefined))
    })
  }

  /** Initialize deployment metadata without inheriting the Agent that happened to mount the provider. */
  override async [Service.init](): Promise<void> {
    await this.ctx.agents.withoutInitiator(() => this.policyOwner.bindAuditSession(undefined)(async () => super[Service.init]()))
  }

  /**
   * Capture the exact live Agent before remote allocation. Agentless Host operations use the fixed connection.
   * @returns An independent connection retained for this Agent's resources and cleanup. Existing resources never reconnect.
   */
  captureExecution(): SshService {
    if (this.poolClosed) throw new HarnessError('SSH session routing is closed.', 'SSH_UNAVAILABLE')
    const agent = this.policyOwner.currentExecutionAgent()
    if (agent === undefined) return this
    const existing = this.bindings.get(agent)
    if (existing !== undefined) return existing.service
    if (this.live.size >= this.capacity) throw new HarnessError('SSH session connection capacity is exhausted. Close an existing connection first.', 'SSH_SESSION_CAPACITY')
    const binding = this.bind(agent)
    this.bindings.set(agent, binding)
    this.live.add(binding)
    binding.start()
    return binding.service
  }

  private stop(bindings: Iterable<Binding>): void {
    for (const binding of bindings) {
      void binding.close().catch((error: unknown) => {
        this.ctx.logger.error('SSH session shutdown was not confirmed; execution dependencies remain retained.', error)
      })
    }
  }

  private bind(agent: Agent): Binding {
    const ctx = this.poolOwner.ctx, policy = this.policyOwner, config = this.connectionConfig
    const proxy = ctx.securityProxy
    const proxied = proxy.route(agent, 'ssh') !== undefined
    const audit = policy.bindAuditSession(agent.id)
    const state = Promise.withResolvers<SshService>()
    let fiber: (Fiber & PromiseLike<Fiber>) | undefined, closing = false
    const current: { connection: ProtectedSshConnection | undefined } = { connection: undefined }
    let disposal: Promise<void> | undefined
    const retired = (): void => {
      this.live.delete(binding)
      if (this.bindings.get(agent) === binding) this.bindings.delete(agent)
    }
    const active = (): void => {
      if (closing || !ctx.agents.list().includes(agent) || ctx.sessions.get(agent.id) !== agent.session) {
        throw new HarnessError('The owning SSH conversation is no longer available.', 'SSH_UNAVAILABLE')
      }
    }
    const execute = async <T>(operation: (ssh: SshService) => Promise<T>): Promise<T> => {
      active()
      return ctx.agents.withInitiator(agent, () => audit(async () => {
        const ssh = await state.promise
        active()
        return operation(ssh)
      }))
    }
    class AgentConnection extends ProtectedSshConnection {
      static override inject = ['credentials', 'targetProtection', 'securityProxy']
      private egress: SecurityProxyEgressLease | undefined

      constructor(scope: Context, input: ConnectionConfig) {
        super(scope, input)
        current.connection = this
      }

      protected override async retainExecution(): Promise<() => void> {
        const release = await super.retainExecution()
        try {
          this.executionSignal().throwIfAborted()
          this.egress = await proxy.openEgress(agent, 'ssh', () => this.dispose(), this.executionSignal())
          this.egress?.signal.throwIfAborted()
          return () => { this.egress?.release(); release() }
        } catch (error) { release(); throw error }
      }

      override dispose(): Promise<void> {
        closing = true
        const settled = super.dispose()
        void settled.then(retired, (_error: unknown) => { /* Failed shutdown remains retained by the pool and execution owners. */ })
        return settled
      }

      protected override async authorizeRequest(method: string, params: unknown, signal: AbortSignal): Promise<void> {
        if (!['close', 'heartbeat', 'fs.streamClose', 'process.terminate'].includes(method)) this.egress?.signal.throwIfAborted()
        await super.authorizeRequest(method, params, signal)
      }

      protected override async connectPeer(peer: SshPeer, signal: AbortSignal): Promise<Socket> {
        const lease = this.egress
        if (lease === undefined) return super.connectPeer(peer, signal)
        const bounded = AbortSignal.any([signal, lease.signal])
        await peer.revalidate(bounded)
        bounded.throwIfAborted()
        const at = Date.now(), started = performance.now()
        let outcome: 'complete' | 'error' = 'error'
        try {
          const tunnel = await connectThrough(lease.upstream, peer.address, this.config.port, this.config.requestTimeoutMs, bounded)
          const socket = this.ownTransport(tunnel.socket)
          bounded.throwIfAborted()
          await peer.revalidate(bounded)
          outcome = 'complete'
          return socket
        } finally {
          lease.capture.append({ at, kind: 'tunnel', origin: 'client', method: 'CONNECT', sessionId: agent.id, tool: 'ssh',
            target: `${this.config.hostname}:${this.config.port}`, status: null, durationMs: Math.round(performance.now() - started),
            requestBytes: 0, responseBytes: 0, outcome, note: 'tunnel-metadata-only',
            requestHeaders: [], responseHeaders: [], requestBody: null, responseBody: null, contentType: null })
        }
      }
    }
    const service: SshService = {
      ready: execute(ssh => ssh.ready),
      get ptcLaunch() {
        active()
        if (current.connection === undefined) throw new HarnessError('The SSH session helper is not ready.', 'SSH_UNAVAILABLE')
        return current.connection.ptcLaunch
      },
      request: (method, params, result, signal, wait) => execute(ssh => ssh.request(method, params, result, signal, wait)),
      connectStream: (endpoint, signal) => execute(ssh => ssh.connectStream(endpoint, signal)),
      dispose: () => binding.close(),
    }
    void service.ready.catch((_error: unknown) => { /* Readiness and resource consumers report activation failure. */ })
    const failed = (error: unknown): void => {
      state.reject(error)
      this.stop([binding])
    }
    const binding: Binding = {
      agent,
      proxied,
      service,
      start: () => {
        try {
          active()
          const starting = ctx.agents.withInitiator(agent, () => audit(async () => {
            fiber = ctx.isolate('ssh').plugin(AgentConnection, config)
            await fiber
            if (current.connection === undefined) throw new HarnessError('The SSH session connection was not initialized.', 'SSH_UNAVAILABLE')
            state.resolve(current.connection)
          }))
          void starting.catch(failed)
        } catch (error) { failed(error) }
      },
      close: () => disposal ??= (async () => {
        closing = true
        try { await current.connection?.dispose() }
        finally { await fiber?.dispose(); await state.promise.catch((_error: unknown) => {}) }
        retired()
      })(),
    }
    return binding
  }

  /** Stop Agent and Host connections; failed shutdown retains its dependencies and remains an error. */
  override dispose(): Promise<void> {
    this.poolClosed = true
    return this.poolDisposal ??= (async () => {
      const results = await Promise.allSettled([...this.live].map(binding => binding.close()))
      const host = await Promise.allSettled([super.dispose()])
      const errors: unknown[] = []
      for (const result of [...results, ...host]) {
        if (result.status === 'rejected') { const reason: unknown = result.reason; errors.push(reason) }
      }
      if (errors.length > 0) throw new AggregateError(errors, 'SSH session shutdown could not be confirmed.')
    })()
  }
}
