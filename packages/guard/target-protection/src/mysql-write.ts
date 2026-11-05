/** Prepared mutations for owner-selected tables in a dedicated MySQL test database. */
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'

/** Identifier subset accepted by the structured write tool and its grant check. */
export const mysqlWriteIdentifier = z.string().regex(/^[a-zA-Z0-9_]{1,64}$/u)

const value = z.union([z.string(), z.number(), z.boolean(), z.null()])
const fields = z.record(mysqlWriteIdentifier, value).refine((entries) => {
  const count = Object.keys(entries).length
  return count > 0 && count <= 64
})

/** One insert, update, or delete. Update and delete require an equality filter. */
export const mysqlWriteInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('insert'), table: mysqlWriteIdentifier, values: fields }).strict(),
  z.object({ operation: z.literal('update'), table: mysqlWriteIdentifier, values: fields, where: fields }).strict(),
  z.object({ operation: z.literal('delete'), table: mysqlWriteIdentifier, where: fields }).strict(),
])

type WriteInput = z.infer<typeof mysqlWriteInput>
/** Scalar sent separately from the prepared MySQL statement. */
export type MysqlParameter = z.infer<typeof value>

function quoteIdentifier(name: string): string { return `\`${name.replaceAll('`', '``')}\`` }

/**
 * Build one prepared mutation. Database and table are explicit so SQL cannot change scope.
 * @param database - Verified writable binding's schema.
 * @param input - Validated operation and fields.
 * @param rowLimit - Maximum rows the server can match in an update or delete.
 * @returns Qualified target, SQL and bound parameters in statement order.
 */
export function mysqlWriteStatement(database: string, input: WriteInput, rowLimit: number) {
  const target = `${quoteIdentifier(database)}.${quoteIdentifier(input.table)}`
  if (input.operation === 'insert') {
    const columns = Object.keys(input.values)
    return {
      target,
      sql: `INSERT INTO ${target} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values: Object.values(input.values),
    }
  }
  const condition = Object.keys(input.where).map(key => `${quoteIdentifier(key)} <=> ?`).join(' AND ')
  const where = `WHERE ${condition} LIMIT ${rowLimit}`
  if (input.operation === 'delete') return { target, sql: `DELETE FROM ${target} ${where}`, values: Object.values(input.where) }
  const assignments = Object.keys(input.values).map(key => `${quoteIdentifier(key)} = ?`).join(', ')
  return {
    target, sql: `UPDATE ${target} SET ${assignments} ${where}`,
    values: [...Object.values(input.values), ...Object.values(input.where)],
  }
}

const allowedPrivileges = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRIGGER'])
const tableGrant = /^GRANT ([A-Z]+(?:, [A-Z]+)*) ON `([A-Za-z0-9_]+)`\.`([A-Za-z0-9_]+)`$/u

/**
 * Admit only direct table grants within the configured schema. TRIGGER is required to inspect existing triggers.
 * @param rows - Array-mode SHOW GRANTS rows for the authenticated account.
 * @param binding - Exact login and configured write tables.
 * @param input - Operation whose privileges must be present on its target table.
 */
export function checkMysqlWriteGrants(rows: unknown, binding: {
  database: string
  username: string
  accountHost: string
  testTables: readonly string[]
}, input: WriteInput): void {
  const reject = () => new HarnessError('MySQL test writes require direct table grants with SELECT, TRIGGER and the requested write privilege.', 'MYSQL_TEST_GRANTS')
  const suffix = ` TO ${quoteIdentifier(binding.username)}@${quoteIdentifier(binding.accountHost)}`
  const grants = new Set<string>()
  const parsed = z.array(z.tuple([z.string()])).safeParse(rows)
  if (!parsed.success) throw reject()
  for (const [grant] of parsed.data) {
    if (!grant.endsWith(suffix)) throw reject()
    const body = grant.slice(0, -suffix.length)
    if (body === 'GRANT USAGE ON *.*') continue
    const [, privilegesText, database, table] = tableGrant.exec(body) ?? []
    if (privilegesText === undefined || table === undefined || database !== binding.database || !binding.testTables.includes(table)) {
      throw reject()
    }
    const privileges = privilegesText.split(', ')
    if (privileges.some(privilege => !allowedPrivileges.has(privilege))) throw reject()
    if (table === input.table) for (const privilege of privileges) grants.add(privilege)
  }
  if (!grants.has('SELECT') || !grants.has('TRIGGER') || !grants.has(input.operation.toUpperCase())) throw reject()
}
