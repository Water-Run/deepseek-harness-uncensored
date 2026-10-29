/** Optional model-facing consumer for fixed PostgreSQL security audits. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './postgres.ts'

/** Cordis plugin name. */
export const name = 'target-postgres-agent'
/** Audit credentials and execution are owned by the provider. */
export const inject = ['tools', 'postgresAudit']

/** @param ctx - Model scope with explicitly configured database bindings. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'database_inspect',
    description: 'Inspect an owner-configured PostgreSQL database identity, table catalogue and selected security settings using fixed read-only queries. This tool accepts no SQL and exposes no passwords. Endpoint protection applies before connecting and before each catalogue query.',
    parameters: { database: { type: 'string', required: true, enum: ctx.postgresAudit.names(), description: 'Configured PostgreSQL binding name.' } },
    output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    async execute(args, exec) { return { ...await ctx.postgresAudit.inspect(args.database, exec.signal) } },
    presentCall: args => ({ card: 'generic', kind: 'other', title: `PostgreSQL · ${args.database}` }),
  })))
}
