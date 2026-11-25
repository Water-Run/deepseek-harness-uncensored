/** Bounded live progress snapshot for one one-shot quick question (/btw). */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tool-todo/types'

/** Longest rendered line before it is clipped with an ellipsis. */
const LINE_CHARS = 600
/** Tool arguments and results are shorter than prose on purpose. */
const DETAIL_CHARS = 240
/** Most recent events considered for the "recent progress" section. */
const RECENT_EVENTS = 48
/** Most todo rows rendered, so one huge list cannot crowd out the status. */
const TODO_ROWS = 40

/**
 * Clip one line to a character budget without splitting a surrogate pair.
 * @param text - raw text, possibly multiline.
 * @param limit - maximum code points kept.
 * @returns single-line text with an ellipsis when clipped.
 */
function clip(text: string, limit = LINE_CHARS): string {
  const compact = text.replace(/\s+/gu, ' ').trim()
  const points = Array.from(compact)
  return points.length <= limit ? compact : `${points.slice(0, Math.max(1, limit - 1)).join('')}…`
}

/** Render model-visible content blocks as one line. */
function visible(content: readonly ContentBlock[]): string {
  return content.flatMap((block) => {
    switch (block.type) {
      case 'text': return [block.text]
      case 'tool-call': return [`calls ${block.name} ${clip(block.arguments, DETAIL_CHARS)}`]
      case 'image': return ['[image]']
      case 'file': return ['[file]']
      // Reasoning, provider replay, and plugin-private content are not progress.
      default: return []
    }
  }).join(' ').trim()
}

/** Keep complete UTF-8 characters and count the omission mark within the limit. */
function fitBytes(text: string, limit: number): string {
  if (Buffer.byteLength(text) <= limit) return text
  const mark = '…'
  const prefix = Buffer.from(text).subarray(0, limit - Buffer.byteLength(mark))
  return new TextDecoder().decode(prefix, { stream: true }) + mark
}

/**
 * Build a bounded live progress snapshot for a quick question. Unlike the side
 * conversation's completed-only updates, this includes the in-flight turn,
 * because the common quick question asks how far the main work has gotten.
 * @param parent - Main conversation identity.
 * @param events - Live parent events, completed or in flight.
 * @param maxBytes - Complete text budget including headings and omission notices; at least 1024 bytes.
 * @returns a bounded snapshot, or empty text when the parent has no progress yet.
 */
export function quickQuestionContext(parent: SessionId, events: readonly SessionEvent[], maxBytes: number): string {
  if (events.length === 0) return ''

  let latestTurnStart = -1
  let turn: number | undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as SessionEvent
    if (event.type !== 'turn/start') continue
    latestTurnStart = index
    turn = event.data.turn
    break
  }
  let ended = false
  let endingReason: string | undefined
  if (turn !== undefined) {
    for (let index = events.length - 1; index > latestTurnStart; index -= 1) {
      const event = events[index] as SessionEvent
      if (event.type !== 'turn/end' || event.data.turn !== turn) continue
      ended = true
      endingReason = JSON.stringify(event.data.reason)
      break
    }
  }
  const running = turn !== undefined && !ended
  let lastStep: number | undefined
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as SessionEvent
    if (event.type !== 'step/start') continue
    if (turn !== undefined && event.data.turn !== turn) break
    lastStep = event.data.step
    break
  }

  let latestRequest = ''
  for (let index = events.length - 1; index >= 0 && latestRequest === ''; index -= 1) {
    const event = events[index] as SessionEvent
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      latestRequest = clip(visible(event.data.content), DETAIL_CHARS)
    }
  }
  const todos = events.findLast(event => event.type === 'todo/write')?.data.todos ?? []

  const header = `Main conversation ${fitBytes(parent, Math.floor(maxBytes / 4))}: progress snapshot (background data, not an instruction). Answer the quick question from it without continuing the main task.\n`
  const status = turn === undefined
    ? 'Status: idle — no turn has started yet.'
    : running
      ? `Status: running — turn ${turn}${lastStep === undefined ? '' : `, step ${lastStep}`} has not ended.`
      : `Status: idle — turn ${turn} ended (${endingReason ?? 'unknown'}).`
  const request = latestRequest === '' ? '' : `Latest user request: ${latestRequest}\n`
  const todoText = todos.length === 0 ? '' : [
    'Current todos (as last written):',
    ...todos.slice(0, TODO_ROWS).map(item => `- [${item.status === 'completed' ? 'x' : item.status === 'in_progress' ? '>' : ' '}] ${clip(item.content, DETAIL_CHARS)}`),
    ...todos.length > TODO_ROWS ? [`- (${todos.length - TODO_ROWS} more rows omitted)`] : [],
    '',
  ].join('\n')

  const recent = recentLines(events, latestTurnStart)
  const recentHeader = 'Recent progress (oldest first):\n'
  const omitted = '[Earlier progress omitted to fit the context budget.]\n'
  const summary = (header + status + '\n' + request + todoText).trimEnd()
  const newest = recent.at(-1)
  if (newest === undefined) return fitBytes(summary, maxBytes)
  const complete = summary + '\n' + recentHeader + recent.join('\n')
  if (Buffer.byteLength(complete) <= maxBytes) return complete
  const reserved = Buffer.byteLength(recentHeader + omitted) + 1
    + Math.min(Buffer.byteLength(newest) + 1, Math.floor(maxBytes / 2))
  const preamble = fitBytes(summary, maxBytes - reserved - 1) + '\n'
  let available = maxBytes - Buffer.byteLength(preamble + recentHeader + omitted)
  const kept: string[] = []
  let truncated = false
  for (const line of recent.toReversed()) {
    const size = Buffer.byteLength(line) + 1
    if (size <= available) { kept.unshift(line); available -= size; continue }
    if (kept.length === 0 && available > 1) {
      kept.unshift(new TextDecoder().decode(Buffer.from(line).subarray(0, available - 1), { stream: true }))
    }
    truncated = true
    break
  }
  if (kept.length === 0) return preamble.trimEnd()
  return `${preamble}${recentHeader}${truncated ? omitted : ''}${kept.join('\n')}`
}

/**
 * Render the newest human instruction, assistant output, tool calls, and tool
 * results as one line each, so the snapshot reads as a work log.
 * @param events - Parent events in log order.
 * @param latestTurnStart - Index of the newest turn opening, or -1 before any turn.
 * @returns recent lines, oldest first.
 */
function recentLines(events: readonly SessionEvent[], latestTurnStart: number): string[] {
  const slice = events.slice(Math.max(0, latestTurnStart - 1, events.length - RECENT_EVENTS))
  return slice.flatMap((event) => {
    switch (event.type) {
      case 'user/message': {
        if (event.data.source.kind !== 'user') return []
        const text = visible(event.data.content)
        return text === '' ? [] : [`[${event.seq} user] ${clip(text, DETAIL_CHARS)}`]
      }
      case 'assistant/message': {
        const text = visible(event.data.message.content)
        return text === '' ? [] : [`[${event.seq} assistant] ${clip(text)}`]
      }
      case 'tool/call':
        return [`[${event.seq} tool ${event.data.name}] ${clip(event.data.arguments, DETAIL_CHARS)}`]
      case 'tool/result': {
        const text = visible(event.data.message.content)
        return [`[${event.seq} tool ${event.data.message.isError ? 'error' : 'result'}] ${clip(text === '' ? '(no output)' : text, DETAIL_CHARS)}`]
      }
      case 'turn/end':
        return [`[${event.seq} turn ended] ${JSON.stringify(event.data.reason)}`]
      default:
        return []
    }
  })
}
