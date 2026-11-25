/** Provider-reported tool identity shared by the Session reader and the error row. */

/**
 * Read the exact tool name quoted by a schema-validation HTTP 400. Callers that change declaration history must match it locally.
 * @param failure - recorded provider failure including the original message.
 * @returns the named tool when the failure begins with the provider's schema diagnostic.
 */
export function rejectedSchemaToolName(failure: { code?: string; status?: number; message: string }): string | undefined {
  if (failure.code !== 'INVALID_REQUEST' || failure.status !== 400) return undefined
  return /^Invalid schema for function '([A-Za-z0-9_-]{1,64})'(?=:|$)/u.exec(failure.message)?.[1]
}
