/** JSON input for parameterized test database mutations. @module */
import { z } from 'zod'

/**
 * Validate one mutation with a protocol-specific identifier length.
 * @param identifier - Valid table and column names for the protocol.
 * @returns A validator requiring values and equality filters where applicable.
 */
export function databaseWriteInput(identifier: z.ZodString) {
  const value = z.union([z.string(), z.number(), z.boolean(), z.null()])
  const fields = z.record(identifier, value).refine((entries) => {
    const count = Object.keys(entries).length
    return count > 0 && count <= 64
  })
  return z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('insert'), table: identifier, values: fields }).strict(),
    z.object({ operation: z.literal('update'), table: identifier, values: fields, where: fields }).strict(),
    z.object({ operation: z.literal('delete'), table: identifier, where: fields }).strict(),
  ])
}

/** Scalar sent separately from a prepared statement. */
export type DatabaseWriteValue = string | number | boolean | null
