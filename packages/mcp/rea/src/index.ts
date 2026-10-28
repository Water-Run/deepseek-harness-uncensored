/** REA launch preferences and owned external connections. @module */
import { Context, Service, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { ReaConnection } from './connection.ts'
import type { ReaOptions, ReaExecutionLease } from './types.ts'

export type { ReaOptions, ReaProbe, ReaExecutionLease } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { /** REA connection owner and persisted launch preferences. */ rea: ReaService }
}

/** Config defaults leave external execution disabled until the owner configures REA. */
interface LiveOptions {
  /** Permit Reverse conversations to start REA. */
  enabled: Volatile<boolean>
  /** Physical Node executable path. */
  nodePath: Volatile<string>
  /** Physical REA entry path. */
  cliPath: Volatile<string>
  /** Optional Ghidra installation directory. */
  ghidraPath: Volatile<string>
  /** Optional Java home directory. */
  javaHome: Volatile<string>
  /** Optional IDA MCP configuration path. */
  idaConfig: Volatile<string>
  /** Native analysis engine selection. */
  provider: Volatile<ReaOptions['provider']>
  /** MCP startup deadline in milliseconds. */
  startupTimeoutMs: Volatile<number>
  /** External call deadline in milliseconds. */
  toolTimeoutMs: Volatile<number>
  /** Maximum entries returned on one discovery page. */
  catalogPageSize: Volatile<number>
}
type ServiceConfig = Partial<ReaOptions> | LiveOptions
export const Config: z<Partial<ReaOptions>, LiveOptions> = z.object({
  enabled: z.boolean().default(false).volatile(), nodePath: z.string().default('').volatile(), cliPath: z.string().default('').volatile(),
  ghidraPath: z.string().default('').volatile(), javaHome: z.string().default('').volatile(), idaConfig: z.string().default('').volatile(),
  provider: z.union(['auto', 'ghidra', 'ida', 'hopper', 'kuna']).default('auto').volatile(),
  startupTimeoutMs: z.natural().min(1000).max(600000).default(60000).volatile(),
  toolTimeoutMs: z.natural().min(1000).max(3600000).default(180000).volatile(),
  catalogPageSize: z.natural().min(1).max(100).default(20).volatile(),
})

/** Root owner; changing configuration closes old connections before replacement. */
export default class ReaService extends Service {
  static Config = Config
  private readonly config: LiveOptions
  /** Loader entry that owns these preferences, absent in unconfigured test contexts. */
  readonly namespace: string | undefined
  private readonly connections = new Set<ReaConnection>()
  private stopped = false
  private reconfiguring: Promise<void> = Promise.resolve()

  /** Current owner preferences, read from Loader-managed live fields. */
  get options(): ReaOptions {
    const config = this.config
    return { enabled: config.enabled.get(), nodePath: config.nodePath.get(), cliPath: config.cliPath.get(),
      ghidraPath: config.ghidraPath.get(), javaHome: config.javaHome.get(), idaConfig: config.idaConfig.get(),
      provider: config.provider.get(), startupTimeoutMs: config.startupTimeoutMs.get(),
      toolTimeoutMs: config.toolTimeoutMs.get(), catalogPageSize: config.catalogPageSize.get() }
  }

  /**
   * @param ctx - Host root context with Loader ownership.
   * @param config - Owner-selected executable paths and timeouts.
   */
  constructor(ctx: Context, config: ServiceConfig = {}) {
    super(ctx, 'rea')
    this.config = typeof config.enabled === 'object' ? config : Config(config)
    this.namespace = ctx.fiber.entry?.options.id
    if (this.options.enabled && (this.options.nodePath.trim() === '' || this.options.cliPath.trim() === '')) {
      throw new Error('REA requires both a Node executable and the installed REA CLI path')
    }
    let previous = JSON.stringify(this.options)
    ctx.on('loader/volatile-update', () => {
      const current = JSON.stringify(this.options)
      if (current === previous) return
      previous = current
      this.reconfiguring = this.closeConnections()
      void this.reconfiguring.catch((error: unknown) => { ctx.logger.error('REA configuration could not close old connections: %o', error) })
    })
    ctx.effect(() => async () => {
      this.stopped = true
      await this.reconfiguring
      await this.closeConnections()
    }, 'rea.connections')
  }

  private async closeConnections(): Promise<void> {
    const owned = [...this.connections]
    const results = await Promise.allSettled(owned.map(async (connection) => {
      await connection.close(); this.connections.delete(connection)
    }))
    const errors: unknown[] = []
    for (const result of results) if (result.status === 'rejected') errors.push(result.reason)
    if (errors.length > 0) throw new AggregateError(errors, 'REA processes did not all close')
  }

  /** @returns An executor-owned lease, or no extra policy for the ordinary provider. */
  protected acquireExecution(): ReaExecutionLease | undefined { return undefined }

  /**
   * Launch one connection, rolling back on cancellation or startup failure.
   * @param cwd - Absolute workspace or temporary probe directory.
   * @param signal - Cancellation of connection acquisition.
   * @returns Connection and disposer; caller must release it with its own lifetime.
   */
  async connect(cwd: string, signal: AbortSignal): Promise<{ connection: ReaConnection; dispose: () => Promise<void> }> {
    await this.reconfiguring
    if (this.stopped) throw new Error('REA service is stopping')
    if (!this.options.enabled) throw new Error('REA is disabled. Configure it in Reverse settings.')
    signal.throwIfAborted()
    const execution = this.acquireExecution()
    let connection: ReaConnection
    try { connection = new ReaConnection(this.options, cwd, execution, (error) => { this.ctx.logger.error('REA execution could not close: %o', error) }) }
    catch (error) { execution?.release(); throw error }
    this.connections.add(connection)
    const dispose = async (): Promise<void> => { await connection.close(); this.connections.delete(connection) }
    let cancellation: Promise<void> | undefined
    const cancel = (): void => { cancellation = dispose(); void cancellation.catch(() => {}) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await connection.ready
      signal.throwIfAborted()
      this.assertRunning()
      return { connection, dispose }
    } catch (error) {
      await (cancellation ?? dispose())
      throw error
    } finally { signal.removeEventListener('abort', cancel) }
  }

  private assertRunning(): void {
    if (this.stopped) throw new Error('REA service is stopping')
  }
}
