/** One isolated REA process, with serialized calls and quiescent shutdown. @module */
import { Client, type Tool } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/client/validators/ajv'
import type { JsonSchemaType, JsonSchemaValidator } from '@modelcontextprotocol/client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { ReaOptions, ReaProbe } from './types.ts'

/** Owns the MCP process and its analysis state for one live Agent or temporary probe. */
export class ReaConnection {
  private readonly client = new Client({ name: 'dshu-rea', version: '0.1.0' })
  private readonly lifetime = new AbortController()
  private readonly transport: StdioClientTransport
  private tail: Promise<unknown> = Promise.resolve()
  private closing: Promise<void> | undefined
  private catalog: readonly Tool[] = []
  private readonly validator = new AjvJsonSchemaValidator()
  private readonly argumentsValidators = new Map<string, JsonSchemaValidator<Record<string, unknown>>>()
  /** Resolves after the MCP handshake and complete tool catalog are available. */
  readonly ready: Promise<void>

  /**
   * @param options - Validated launch preferences.
   * @param cwd - Working directory assigned by the owning workspace service.
   */
  constructor(private readonly options: ReaOptions, cwd: string) {
    const env = { ...scrubbedParentEnv(), REA_MCP_INPUT_SCHEMA_PROFILE: 'compact' }
    const overrides: Record<string, string> = {
      GHIDRA_INSTALL_DIR: options.ghidraPath, JAVA_HOME: options.javaHome,
      REA_IDA_MCP_CONFIG: options.idaConfig,
      REA_ANALYSIS_PROVIDER: options.provider === 'auto' ? '' : options.provider,
    }
    this.transport = new StdioClientTransport({ command: options.nodePath, args: [options.cliPath, 'mcp'], cwd,
      env: { ...env, ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== '')) }, stderr: 'pipe' })
    // Drain diagnostics without retaining engine output or leaking it to the model.
    this.transport.stderr?.on('data', () => {})
    this.client.onclose = () => { this.lifetime.abort(new Error('REA connection closed; reset the connection and reopen the sample.')) }
    this.ready = this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      await this.client.connect(this.transport, { signal: this.lifetime.signal, timeout: this.options.startupTimeoutMs })
      this.catalog = (await this.client.listTools(undefined, {
        signal: this.lifetime.signal, timeout: this.options.startupTimeoutMs,
      })).tools
      if (new Set(this.catalog.map(tool => tool.name)).size !== this.catalog.length) throw new Error('REA returned duplicate tool names')
      this.lifetime.signal.throwIfAborted()
    } catch (error) {
      await this.client.close()
      throw error
    }
  }

  /**
   * Read the discovered catalog after initialization.
   * @returns Upstream tools, including their original input and output schemas.
   */
  tools(): readonly Tool[] { this.lifetime.signal.throwIfAborted(); return this.catalog }

  /**
   * Describe the successful handshake, without claiming optional engines were exercised.
   * @returns Server identity, tool names, and configured engine locations.
   */
  describe(): ReaProbe {
    const version = this.client.getServerVersion()
    return { name: version?.name ?? 'REA', version: version?.version ?? '', toolCount: this.catalog.length,
      tools: this.catalog.map(tool => tool.name), engines: [
        { name: 'Ghidra', path: this.options.ghidraPath },
        { name: 'Java', path: this.options.javaHome },
        { name: 'IDA MCP', path: this.options.idaConfig },
      ].map(engine => ({ ...engine, state: engine.path === '' ? 'discover' : 'configured' })) }
  }

  /**
   * Serialize one upstream call; failures never trigger automatic replay.
   * @param tool - Tool from this connection's catalog.
   * @param args - Arguments validated by the shared MCP tool definition.
   * @param signal - Calling turn's cancellation.
   * @returns Raw MCP result for canonical validation and durable presentation.
   */
  call(tool: Tool, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const task = this.tail.then(async () => {
      combined.throwIfAborted()
      await this.ready
      let validate = this.argumentsValidators.get(tool.name)
      if (validate === undefined) {
        validate = this.validator.getValidator<Record<string, unknown>>(tool.inputSchema as JsonSchemaType)
        this.argumentsValidators.set(tool.name, validate)
      }
      const parsed = validate(args)
      if (!parsed.valid) throw new Error(`Invalid arguments for ${tool.name}: ${parsed.errorMessage}`)
      return this.client.callTool({ name: tool.name, arguments: args },
        { signal: combined, timeout: this.options.toolTimeoutMs, toolDefinition: tool })
    })
    this.tail = task.catch(() => {})
    return task
  }

  /**
   * Interrupt startup and calls, close the transport, then drain owned promises.
   * @returns Shared completion; transport-close failures remain visible.
   */
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.lifetime.abort(new Error('REA connection disposed'))
      await this.client.close()
      await Promise.allSettled([this.ready, this.tail])
    })()
  }
}
