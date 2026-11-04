/** Optional model-facing PostgreSQL audit and dedicated test SQL tools. @module */
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
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
  const names = ctx.postgresAudit.testSqlNames()
  if (names.length === 0) return
  ctx.inject(['sandboxPolicy'], (scope) => {
    scope.effect(() => scope.tools.register(defineTool({
      name: 'database_test_sql',
      description: 'Run one PostgreSQL statement on a dedicated test binding configured by the owner. The test server and database are checked before connecting, and the verified role must have no elevated privileges. A successful result means PostgreSQL acknowledged the commit.',
      parameters: {
        database: { type: 'string', required: true, enum: names, description: 'Configured test database name.' },
        sql: { type: 'string', required: true, description: 'One SQL statement. Use $1-style placeholders for values.' },
        parameters: { type: 'string', description: 'JSON array of null, string or finite number values. Omit for an empty array.' },
      },
      output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
      execute(args, exec) {
        const policy = scope.sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
        if (policy.mode !== 'danger-full-access') throw new HarnessError('Test SQL requires full conversation permissions.', 'POSTGRES_TEST_PERMISSION')
        let parameters: unknown = []
        if (args.parameters !== undefined) {
          try { parameters = JSON.parse(args.parameters) }
          catch (error) { throw new HarnessError('PostgreSQL parameters must be a JSON array.', 'POSTGRES_INVALID_SQL', { cause: error }) }
        }
        return scope.postgresAudit.executeTestSql(args.database, args.sql, parameters, exec.signal).then(result => ({ ...result }))
      },
      presentCall: args => ({ card: 'generic', kind: 'other', title: `PostgreSQL · ${args.database}` }),
    })))
  })
}
