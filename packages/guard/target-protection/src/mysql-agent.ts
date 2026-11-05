/** Optional model-facing MySQL audits and structured test writes. @module */
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
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
  const names = ctx.mysqlAudit.testWriteNames()
  if (names.length === 0) return
  ctx.inject(['sandboxPolicy'], (scope) => {
    scope.effect(() => scope.tools.register(defineTool({
      name: 'mysql_test_write',
      description: 'Apply one parameterized insert, update or delete on an owner-configured MySQL test table. Update and delete require equality filters. A result is returned only after commit acknowledgement.',
      parameters: {
        database: { type: 'string', required: true, enum: names, description: 'Configured test database name.' },
        mutation: { type: 'string', required: true, description: 'JSON object with operation, table and values for insert or update. Include a nonempty where object for update or delete. Use strings, numbers, booleans or null as field values.' },
      },
      output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
      async execute(args, exec) {
        const policy = scope.sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
        if (policy.mode !== 'danger-full-access') {
          throw new HarnessError('MySQL test writes require full conversation permissions.', 'MYSQL_TEST_PERMISSION')
        }
        let mutation: unknown
        try { mutation = JSON.parse(args.mutation) }
        catch (error) { throw new HarnessError('MySQL test mutation must be a JSON object.', 'MYSQL_INVALID_WRITE', { cause: error }) }
        return { ...await scope.mysqlAudit.writeTest(args.database, mutation, exec.signal) }
      },
      presentCall: args => ({ card: 'generic', kind: 'other', title: `MySQL · ${args.database}` }),
    })))
  })
}
