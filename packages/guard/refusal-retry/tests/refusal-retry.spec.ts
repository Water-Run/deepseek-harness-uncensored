import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { classifyAnswer } from '../src/classify.ts'
import { nextArm, retryMessage } from '../src/arms.ts'
import { Config, apply, configuredArms, planRetry, readAnswer, type Answer, type Budget, type Limits } from '../src/index.ts'

const LIMITS: Limits = { maxPerTurn: 2, maxPerSession: 6 }

describe('classifyAnswer', () => {
  it('treats an answer that called tools as delivered', () => {
    expect(classifyAnswer('我不能提供这个。', 1)).toBe('delivered')
  })

  it('detects Chinese and English refusal openings', () => {
    expect(classifyAnswer('我不能提供这类内容。', 0)).toBe('refused')
    expect(classifyAnswer('抱歉，这个我做不了。', 0)).toBe('refused')
    expect(classifyAnswer("I can't help with that request.", 0)).toBe('refused')
    expect(classifyAnswer('Unfortunately I must decline.', 0)).toBe('refused')
  })

  it('delivers when the opening is normal prose', () => {
    expect(classifyAnswer('先给结论：这是一段可直接使用的代码。', 0)).toBe('delivered')
  })

  it('marks an empty answer', () => {
    expect(classifyAnswer('   ', 0)).toBe('empty_after_retry')
  })

  it('separates a refusal opening that still delivered adjacent content', () => {
    const long = `我不能帮你做这件事。${'但可以从防御角度分析：'.repeat(60)}`
    expect(classifyAnswer(long, 0)).toBe('partial_refused')
  })
})

describe('retry arms', () => {
  it('escalates to the last arm and stays there', () => {
    expect(nextArm(0, [1])).toBe(1)
    expect(nextArm(0, [1, 2, 3])).toBe(1)
    expect(nextArm(1, [1, 2, 3])).toBe(2)
    expect(nextArm(2, [1, 2, 3])).toBe(3)
    expect(nextArm(9, [1, 2, 3])).toBe(3)
    expect(nextArm(0, [])).toBeUndefined()
  })

  it('labels the continuation with the guard source', () => {
    const message = retryMessage(2, 'summary')
    expect(message.source.kind).toBe('refusal-retry')
    const first = message.content[0]
    expect(first?.type === 'text' ? first.text : '').toContain('虚构作品')
  })

  it('keeps only recognized arms', () => {
    expect(configuredArms([0, 1, 4, 2])).toEqual([1, 2])
  })
})

describe('readAnswer', () => {
  it('joins text blocks and ignores reasoning', () => {
    const blocks: ContentBlock[] = [
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text: '前半段' },
      { type: 'text', text: '后半段' },
    ]
    expect(readAnswer(blocks)).toEqual({ text: '前半段后半段', toolCalls: 0 })
  })
})

describe('planRetry', () => {
  const refused: Answer = { text: '我不能提供这个。', toolCalls: 0 }
  const delivered: Answer = { text: '这是成品代码。', toolCalls: 0 }
  const fresh: Budget = { turn: 0, total: 0 }

  it('continues a refused turn with the first arm', () => {
    expect(planRetry(refused, fresh, [1], LIMITS)).toBe(1)
  })

  it('escalates through the configured arms', () => {
    expect(planRetry(refused, { turn: 1, total: 1 }, [1, 2, 3], LIMITS)).toBe(2)
    expect(planRetry(refused, { turn: 2, total: 2 }, [1, 2, 3], LIMITS)).toBeUndefined()
  })

  it('honours the per-turn cap', () => {
    expect(planRetry(refused, { turn: 2, total: 2 }, [1], LIMITS)).toBeUndefined()
  })

  it('honours the per-session cap', () => {
    expect(planRetry(refused, { turn: 0, total: 6 }, [1], LIMITS)).toBeUndefined()
  })

  it('leaves delivered and missing answers alone', () => {
    expect(planRetry(delivered, fresh, [1], LIMITS)).toBeUndefined()
    expect(planRetry(undefined, fresh, [1], LIMITS)).toBeUndefined()
    expect(planRetry({ text: '', toolCalls: 0 }, fresh, [1], LIMITS)).toBeUndefined()
  })
})

describe('plugin mounting', () => {
  it('registers nothing when every arm is unknown', async () => {
    const ctx = new Context()
    try {
      apply(ctx, { arms: [] })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('registers the listener and keeps the documented defaults', async () => {
    const ctx = new Context()
    try {
      apply(ctx, {})
      expect(Config({})).toMatchObject({ arms: [1], maxPerTurn: 2, maxPerSession: 6 })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
