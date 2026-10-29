/** Optional model consumer for explicitly configured local SQLite databases. @module */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from './sqlite.ts'
import { parseSqliteRequest } from './sqlite.ts'

/** Cordis plugin name. */
export const name = 'target-sqlite-agent'
/** Both user permissions and executor target checks remain mandatory. */
export const inject = ['tools', 'sandboxPolicy', 'sqliteDatabase']

/** @param ctx - Caller scope with the configured database executor. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'database_query',
    description: 'Run parameterized SQL on an owner-configured local SQLite database. Only names returned by the configured bindings are available. A call executes one statement atomically; transaction control, attachments, extension loading and file-changing PRAGMAs are unsupported. Production audit and read-only conversation permissions cannot write. Keep query results small.',
    parameters: {
      database: { type: 'string', required: true, enum: ctx.sqliteDatabase.names(), description: 'Configured database name.' },
      sql: { type: 'string', required: true, description: 'One SQLite statement; use ? placeholders for values.' },
      parameters: { type: 'string', description: 'JSON array of null, string or finite number parameters; omit for [].' },
    },
    output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute(args, exec) {
      const parameters: unknown = args.parameters === undefined ? [] : JSON.parse(args.parameters)
      return ctx.sqliteDatabase.execute(args.database, parseSqliteRequest({ statements: [{ sql: args.sql, parameters }],
        readOnly: ctx.sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session }).mode !== 'danger-full-access' }), exec.signal)
    },
    presentCall: args => ({ card: 'generic', kind: 'other', title: `SQL · ${args.database}` }),
  })))
}
