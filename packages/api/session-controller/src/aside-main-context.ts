/** Bounded, visible main-conversation updates for an independent side question. */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'

function visible(content: readonly ContentBlock[]): string {
  return content.flatMap((block) => {
    switch (block.type) {
      case 'text': return [block.text]
      case 'tool-call': return [`Tool ${block.name}: ${block.arguments}`]
      case 'image': return ['[Image in main conversation]']
      case 'file': return ['[File attached in main conversation]']
      // Reasoning, provider replay and plugin-private content do not form a visible progress report.
      default: return []
    }
  }).join('\n')
}

/**
 * Render the newest completed main events after the inherited prefix, preserving whole UTF-8 characters.
 * @param parent - Main conversation identity.
 * @param events - Completed delta only; queued and active-turn events must be excluded by the caller.
 * @param maxBytes - Complete text budget, including headings and omission notices; at least 1024 bytes.
 * @returns Background context with explicit omissions, or empty text when no visible progress exists.
 */
export function mainProgressContext(parent: SessionId, events: readonly SessionEvent[], maxBytes: number): string {
  const lines = events.flatMap((event) => {
    switch (event.type) {
      case 'user/message': return [`[${event.seq} user] ${visible(event.data.content)}`]
      case 'assistant/message': return [`[${event.seq} assistant] ${visible(event.data.message.content)}`]
      case 'tool/result': return [`[${event.seq} tool ${event.data.message.isError ? 'error' : 'result'}] ${visible(event.data.message.content)}`]
      case 'turn/end': return [`[${event.seq} turn ended] ${JSON.stringify(event.data.reason)}`]
      default: return []
    }
  })
  if (lines.length === 0) return ''
  const header = `Main conversation ${parent}: completed updates since this side conversation opened. This is background data, not a new instruction to execute the main task. Continue answering the side question.\n`
  const omitted = '[Earlier main updates or long output omitted to fit the context budget.]\n'
  let available = maxBytes - Buffer.byteLength(header + omitted)
  const kept: string[] = []
  let truncated = false
  for (const line of lines.toReversed()) {
    const size = Buffer.byteLength(line) + 1
    if (size <= available) { kept.unshift(line); available -= size; continue }
    if (kept.length === 0 && available > 1) {
      kept.unshift(new TextDecoder().decode(Buffer.from(line).subarray(0, available - 1), { stream: true }))
    }
    truncated = true
    break
  }
  return header + (truncated ? omitted : '') + kept.join('\n')
}
