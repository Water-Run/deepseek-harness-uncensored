/** Optional model-facing consumer for fixed MySQL catalogue audits. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './mysql.ts'

/** Cordis plugin name. */
export const name = 'target-mysql-agent'
/** Keep the model tool mounted only while the configured audit provider is available. */
export const inject = ['tools', 'mysqlAudit']

/** @param ctx - Model scope with owner-configured MySQL bindings. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'mysql_inspect',
    description: 'Inspect a configured MySQL database identity, TLS cipher and table catalogue through fixed read-only queries.',
    parameters: { database: { type: 'string', required: true, enum: ctx.mysqlAudit.names(), description: 'Configured MySQL binding name.' } },
    output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    async execute(args, exec) { return { ...await ctx.mysqlAudit.inspect(args.database, exec.signal) } },
    presentCall: args => ({ card: 'generic', kind: 'other', title: `MySQL · ${args.database}` }),
  })))
}
