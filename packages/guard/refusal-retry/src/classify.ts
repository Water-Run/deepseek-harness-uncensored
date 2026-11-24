/**
 * Verdict classifier for one finished answer. It reads only the answer text and
 * the number of tool calls the answer issued: a turn that called tools did work,
 * whatever its prose says.
 *
 * @module @deepseek-ai/dsh-refusal-retry/classify
 */

import type { RefusalVerdict } from './types.ts'

/** Characters of the answer's head inspected for a refusal opening. */
export const HEAD_CHARS = 220

/** Answer length below which a retried answer counts as empty. */
export const EMPTY_CHARS = 200

/** Answer length above which a refusal opening still counts as partial delivery. */
export const PARTIAL_CHARS = 500

/**
 * Refusal openings in either shipped language. The expressions match the head of
 * an answer, where a refusal starts; an example quoted later in a long answer does
 * not trip them.
 */
const REFUSAL_HEAD = new RegExp([
  String.raw`^\s*(?:[#>*\-\s]*)?`,
  String.raw`(?:我(?:不能|无法|不会|不写|做不了|帮不了|拒绝)|抱歉|对不起|很抱歉`,
  String.raw`|i\s*(?:can(?:'|no)t|cannot|won't|will not|am unable|must decline)`,
  String.raw`|unfortunately|sorry|i'?m sorry|as an ai)`,
].join(''), 'iu')

/**
 * Classify one answer.
 * @param text - the assistant answer text, without reasoning blocks.
 * @param toolCalls - how many tool calls the same answer issued.
 * @returns The verdict driving retry and audit.
 */
export function classifyAnswer(text: string, toolCalls: number): RefusalVerdict {
  if (toolCalls > 0) return 'delivered'
  const trimmed = text.trim()
  if (trimmed.length === 0) return 'empty_after_retry'
  if (!REFUSAL_HEAD.test(trimmed.slice(0, HEAD_CHARS))) return 'delivered'
  return trimmed.length >= PARTIAL_CHARS ? 'partial_refused' : 'refused'
}
