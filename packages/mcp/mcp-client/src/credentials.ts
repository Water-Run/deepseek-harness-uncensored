/** Runtime template resolution for one MCP instance. */

import type { Context } from '@deepseek-ai/cordis'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { assertTemplateSyntax, credentialRefsIn, resolveTemplateString } from './templates.ts'
import { describeError, McpLocalError } from './diagnostic.ts'
import type { Config } from './index.ts'

/** Resolves raw configuration through the current credential provider. */
export class McpTemplateBinding {
  /** Enabled credential references from raw configuration, including currently unconfigured references. */
  readonly refs: ReadonlySet<string>

  constructor(private readonly ctx: Context, private readonly config: Config) {
    const strings = config.transport === 'stdio'
      ? [config.command, ...config.args, ...Object.values(config.env), config.cwd]
      : [config.url, ...Object.values(config.headers)]
    this.refs = new Set(config.expandTemplates ? strings.flatMap(credentialRefsIn) : [])
    if (config.expandTemplates) {
      for (const value of strings) assertTemplateSyntax(value, `mcp-client(${config.serverName})`)
      if (this.refs.size > 0 && ctx.get('credentials') === undefined) {
        throw new McpLocalError('MCP credential templates require a credentials provider')
      }
    }
  }

  /**
   * Format a failure, naming the operation and the upstream text that failed.
   * @param error - caught operation failure.
   * @param operation - local operation name for the diagnostic.
   * @returns diagnostic text for the configured template mode.
   */
  diagnostic(error: unknown, operation: string): string {
    if (!this.config.expandTemplates) return describeError(error)
    return `mcp-client(${this.config.serverName}): ${operation}: ${describeError(error)}`
  }

  /**
   * Resolve transport strings without changing the plugin's raw configuration.
   * @param signal - cancellation checked before and after template resolution.
   * @returns resolved transport configuration, or the raw configuration when expansion is disabled.
   * @throws when a credential or the credentials provider is unavailable.
   */
  async resolve(signal: AbortSignal): Promise<Config> {
    signal.throwIfAborted()
    if (!this.config.expandTemplates) return this.config
    const values = new Map<string, Promise<string | undefined>>()
    const credential = (ref: string): Promise<string | undefined> => {
      let value = values.get(ref)
      if (value === undefined) {
        const provider = this.ctx.get('credentials')
        if (provider === undefined) throw new McpLocalError('MCP credential templates require a credentials provider')
        value = provider.resolve(ref as CredentialRef).then(result => result?.value)
        values.set(ref, value)
      }
      return value
    }
    const resolve = async (value: string, path: string): Promise<string> => {
      const result = await resolveTemplateString(value, path, credential)
      signal.throwIfAborted()
      return result
    }
    const record = async (value: Record<string, string>, path: string): Promise<Record<string, string>> => {
      const resolved: Array<[string, string]> = []
      for (const [key, entry] of Object.entries(value)) resolved.push([key, await resolve(entry, `${path}.${key}`)])
      return Object.fromEntries(resolved)
    }
    const config = this.config
    if (config.transport === 'stdio') {
      const args: string[] = []
      for (const [index, arg] of config.args.entries()) args.push(await resolve(arg, `args[${index}]`))
      return {
        ...config,
        command: await resolve(config.command, 'command'),
        args,
        env: await record(config.env, 'env'),
        cwd: await resolve(config.cwd, 'cwd'),
      }
    }
    return { ...config, url: await resolve(config.url, 'url'), headers: await record(config.headers, 'headers') }
  }
}
