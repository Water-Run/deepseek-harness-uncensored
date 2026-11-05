/** Prepared mutations on owner-selected ordinary PostgreSQL test tables. @module */
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { databaseWriteInput, type DatabaseWriteValue } from './database-write.ts'

const identifier = z.string().regex(/^[a-zA-Z0-9_]{1,63}$/u)
const schemaName = identifier.refine(value => !/^pg_|^information_schema$/iu.test(value))

/** Explicitly permitted schema and table pairs, with no wildcards or system schemas. */
export const postgresWriteTables = z.array(z.object({ schema: schemaName, table: identifier }).strict()).max(16)
  .refine(tables => new Set(tables.map(({ schema, table }) => `${schema}.${table}`)).size === tables.length)

/** Scoped mutation with a named schema and structured values and filters. */
export const postgresWriteInput = z.object({ schema: schemaName, mutation: databaseWriteInput(identifier) }).strict()

/** A PostgreSQL mutation acknowledged by the server, with its affected row count. */
export interface PostgresWriteResult {
  operation: 'insert' | 'update' | 'delete'
  affectedRows: number
}

type Query = (text: string, values?: (string | number | null | string[])[]) => Promise<{
  rows: (string | null)[][]
  rowCount: number | null
}>

const tableCheck = `SELECT c.oid::text FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_am am ON am.oid = c.relam
  WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r' AND c.relpersistence = 'p'
    AND am.amname = 'heap' AND NOT (c.relispartition OR c.relrowsecurity OR c.relforcerowsecurity)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid = c.oid OR inhparent = c.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = c.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class = c.oid)
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE (conrelid = c.oid AND contype NOT IN ('p', 'u', 'n')) OR (confrelid = c.oid AND contype = 'f'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      AND (a.atttypid NOT IN ('bool'::regtype, 'int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'text'::regtype, 'varchar'::regtype)
        OR a.atthasdef OR a.attidentity <> '' OR a.attgenerated <> ''))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid JOIN pg_catalog.pg_am index_am ON index_am.oid = idx.relam
      WHERE i.indrelid = c.oid AND (index_am.amname <> 'btree' OR i.indexprs IS NOT NULL OR i.indpred IS NOT NULL
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_opclass op JOIN pg_catalog.pg_namespace ns ON ns.oid = op.opcnamespace
          WHERE op.oid = ANY(i.indclass) AND (ns.nspname <> 'pg_catalog' OR NOT op.opcdefault))))`

function quote(name: string): string { return `"${name}"` }

function parameter(value: DatabaseWriteValue): string | number | null {
  return typeof value === 'boolean' ? String(value) : value
}

/**
 * Lock and check the exact table before applying a prepared mutation in the caller's transaction.
 * @param query - Admitted PostgreSQL queries with the pg_catalog search path.
 * @param input - Validated schema, table, scalar values and equality filters.
 * @param maxRows - Maximum rows that may be affected.
 * @returns The server's affected row count, pending the caller's commit.
 */
export async function postgresWrite(
  query: Query, input: z.infer<typeof postgresWriteInput>, maxRows: number,
): Promise<PostgresWriteResult> {
  const { schema, mutation } = input
  const target = `${quote(schema)}.${quote(mutation.table)}`
  const keys = [schema, mutation.table]
  const rejected = () => new HarnessError(
    'Use an ordinary PostgreSQL test table with built-in scalar columns and no write hooks.', 'POSTGRES_TEST_TABLE_UNSAFE',
  )
  const oid = (await query(tableCheck, keys)).rows[0]?.[0]
  if (oid == null) throw rejected()
  await query(`LOCK TABLE ONLY ${target} IN SHARE ROW EXCLUSIVE MODE`)
  if ((await query(tableCheck, keys)).rows[0]?.[0] !== oid) throw rejected()

  const { operation } = mutation
  const values = operation === 'delete' ? [] : Object.entries(mutation.values)
  const bound = values.map(([, value]) => parameter(value))
  let result
  let expectedRows = 1
  if (operation === 'insert') {
    const columns = values.map(([name]) => quote(name)).join(', ')
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
    result = await query(`INSERT INTO ${target} (${columns}) VALUES (${placeholders})`, bound)
  } else {
    const filters = Object.entries(mutation.where)
    const condition = filters.map(([name], index) => `${quote(name)} IS NOT DISTINCT FROM $${index + 1}`).join(' AND ')
    const matches = await query(`SELECT ctid::text FROM ONLY ${target} WHERE ${condition} LIMIT $${filters.length + 1} FOR UPDATE`,
      [...filters.map(([, value]) => parameter(value)), maxRows + 1])
    if (matches.rows.length > maxRows) throw new HarnessError('PostgreSQL test write matched too many rows.', 'POSTGRES_OUTPUT_LIMIT')
    const ids = z.array(z.tuple([z.string()])).parse(matches.rows).map(([id]) => id)
    expectedRows = ids.length
    const where = `WHERE ctid = ANY($${bound.length + 1}::tid[])`
    const assignments = values.map(([name], index) => `${quote(name)} = $${index + 1}`).join(', ')
    const statement = operation === 'delete' ? `DELETE FROM ONLY ${target}` : `UPDATE ONLY ${target} SET ${assignments}`
    result = await query(`${statement} ${where}`, [...bound, ids])
  }
  if (result.rowCount !== expectedRows) throw rejected()
  return { operation, affectedRows: expectedRows }
}
