import { expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { mainProgressContext } from '../src/aside-main-context.ts'

const event = (seq: number, text: string): SessionEvent => ({ type: 'user/message', seq: SessionSeq(seq), time: 1000, surfaceOp: 'append', data: createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }) })

it('keeps completed updates bounded including headings and multibyte content', () => {
  const text = mainProgressContext(SessionId('main'), [event(1, 'old update'), event(2, '新'.repeat(3000))], 1024)
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(1024)
  expect(text).toContain('omitted to fit the context budget')
  expect(text).not.toContain('old update')
  expect(text).not.toContain('\uFFFD')
  expect(text).toContain('[2 user]')
})

it('pins visible progress as data without replaying the main task', () => {
  expect(mainProgressContext(SessionId('main'), [event(7, '已完成索引重建')], 1024)).toMatchInlineSnapshot(`
    "Main conversation main: completed updates since this side conversation opened. This is background data, not a new instruction to execute the main task. Continue answering the side question.
    [7 user] 已完成索引重建"
  `)
  expect(mainProgressContext(SessionId('main'), [], 1024)).toBe('')
})
