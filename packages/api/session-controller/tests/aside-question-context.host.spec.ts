// @vitest-environment node
/** Bounded live progress for one-shot quick questions. */
import { expect, it } from 'vitest'
import { createAssistantMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import { quickQuestionContext } from '../src/aside-question-context.ts'

const parent = SessionId('main')

function user(seq: number, text: string): SessionEvent {
  return {
    type: 'user/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
    data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
  }
}

function assistant(seq: number, text: string): SessionEvent {
  return {
    type: 'assistant/message', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
    data: {
      turn: 1, step: 1, stream: [],
      message: createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'mock', model: 'mock' } }),
    },
  }
}

function toolCall(seq: number, name: string, args: object): SessionEvent {
  return {
    type: 'tool/call', seq: SessionSeq(seq), time: seq,
    data: { turn: 1, step: 1, callId: ToolCallId(`call-${seq}`), name, arguments: JSON.stringify(args) },
  }
}

function toolResult(seq: number, text: string): SessionEvent {
  return {
    type: 'tool/result', seq: SessionSeq(seq), time: seq, surfaceOp: 'append',
    data: {
      turn: 1, step: 1,
      message: createToolResultMessage({ callId: ToolCallId(`call-${seq}`), content: [{ type: 'text', text }], isError: false }),
    },
  }
}

function turnStart(seq: number, turn: number): SessionEvent {
  return { type: 'turn/start', seq: SessionSeq(seq), time: seq, data: { turn } }
}

function stepStart(seq: number, turn: number, step: number): SessionEvent {
  return { type: 'step/start', seq: SessionSeq(seq), time: seq, data: { turn, step } }
}

function turnEnd(seq: number, turn: number, reason: TurnEndReason): SessionEvent {
  return { type: 'turn/end', seq: SessionSeq(seq), time: seq, data: { turn, reason } }
}

it('reports the in-flight turn, latest request, todos, and recent work', () => {
  const events = [
    turnStart(1, 1), user(2, 'old instruction'), assistant(3, 'old reply'), turnEnd(4, 1, { kind: 'completed' }),
    turnStart(5, 2), stepStart(6, 2, 1), user(7, '把索引重建完'), assistant(8, '先看目录结构'),
    toolCall(9, 'todo_write', {
      todos: [{ content: '重建索引', status: 'in_progress' }, { content: '核对结果', status: 'pending' }],
    }),
    toolResult(10, 'index rebuilt'), stepStart(11, 2, 2), toolCall(12, 'exec_command', { command: 'ls' }),
  ]
  const text = quickQuestionContext(parent, events, 8192)
  expect(text).toContain('Status: running — turn 2, step 2 has not ended.')
  expect(text).toContain('Latest user request: 把索引重建完')
  expect(text).toContain('- [>] 重建索引')
  expect(text).toContain('- [ ] 核对结果')
  expect(text).toContain('tool exec_command')
  expect(text).toContain('index rebuilt')
  // The snapshot starts at the turn before the live one; older turns stay out.
  expect(text).not.toContain('old reply')
  expect(text).not.toContain('old instruction')
})

it('reports a completed turn with its end reason and last assistant output', () => {
  const events = [
    turnStart(1, 1), stepStart(2, 1, 1), user(3, '完成任务'), assistant(4, '已经完成并核对了结果'),
    turnEnd(5, 1, { kind: 'completed' }),
  ]
  const text = quickQuestionContext(parent, events, 8192)
  expect(text).toContain('Status: idle — turn 1 ended ({"kind":"completed"}).')
  expect(text).toContain('Latest user request: 完成任务')
  expect(text).toContain('已经完成并核对了结果')
})

it('stays bounded, keeps whole characters, and marks omitted progress', () => {
  const events = [
    turnStart(1, 1), user(2, '任务'), assistant(3, '新'.repeat(4000)),
    turnEnd(4, 1, { kind: 'completed' }),
  ]
  const text = quickQuestionContext(parent, events, 1024)
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1024)
  expect(text).not.toContain('\uFFFD')
  expect(text).toContain('omitted to fit the context budget')
})

it('returns no context before any progress and tolerates malformed todo arguments', () => {
  expect(quickQuestionContext(parent, [], 8192)).toBe('')
  const malformed: SessionEvent = {
    type: 'tool/call', seq: SessionSeq(1), time: 1,
    data: { turn: 1, step: 1, callId: ToolCallId('call-1'), name: 'todo_write', arguments: '{not json' },
  }
  const text = quickQuestionContext(parent, [malformed], 8192)
  expect(text).toContain('Status: idle — no turn has started yet.')
  expect(text).not.toContain('Current todos')
})
