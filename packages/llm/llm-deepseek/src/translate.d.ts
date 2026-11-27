/** Translate Messages events while preserving block order and cumulative usage. */
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
/** Decode a required string from provider JSON.
 * @param value - provider field.
 * @returns the validated string.
 */
export declare function string(value: unknown): string;
/** Translate decoded SSE data into the Harness stream protocol.
 * @param events - framed, decoded provider events in arrival order.
 * @param model - requested model id stored in durable replay state.
 * @returns blocks, then final usage and a finish chunk on completion. A refusal yields final usage before throwing `CONTENT_REFUSED`.
 */
export declare function translate(events: AsyncIterable<Record<string, unknown>>, model: string): AsyncGenerator<StreamChunk>;
//# sourceMappingURL=translate.d.ts.map