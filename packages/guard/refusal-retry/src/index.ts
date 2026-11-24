/**
 * Refusal-retry guard: when a turn's final answer refuses instead of delivering,
 * the guard continues the same turn with a stronger arm rather than letting the
 * refusal end the turn. Bounded per turn and per session; every attempt is logged
 * as `refusal/retry`, so cost and outcome stay reconstructable.
 *
 * @module @deepseek-ai/dsh-refusal-retry
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { classifyAnswer } from './classify.ts'
import { nextArm, retryMessage, type ArmId } from './arms.ts'

export const name = 'refusal-retry'

/** Plugin configuration. */
export interface Config {
  /** Arm order to escalate through; an empty list disables the guard. */
  arms?: number[]
  /** Attempts allowed in one turn. */
  maxPerTurn?: number
  /** Attempts allowed in one session. */
  maxPerSession?: number
}

export const Config: z<Config> = z.object({
  arms: z.array(z.number()).default([1]),
  maxPerTurn: z.number().default(2),
  maxPerSession: z.number().default(6),
})

/** Attempts one agent consumed. */
export interface Budget {
  /** Attempts inside the current turn. */
  turn: number
  /** Attempts across the session. */
  total: number
}

/** What one finished answer looks like to the guard. */
export interface Answer {
  /** Visible answer text, reasoning blocks excluded. */
  text: string
  /** Tool calls the same answer issued. */
  toolCalls: number
}

/** Caps applied to one turn. */
export interface Limits {
  /** Attempts allowed in one turn. */
  maxPerTurn: number
  /** Attempts allowed in one session. */
  maxPerSession: number
}

/**
 * Read the visible text and tool-call count of one answer's content blocks.
 * @param blocks - model-facing content blocks of the answer.
 * @returns The answer text and how many tool calls it issued.
 */
export function readAnswer(blocks: readonly ContentBlock[]): Answer {
  let text = ''
  let toolCalls = 0
  for (const block of blocks) {
    if (block.type === 'text') text += block.text
    else if (block.type === 'tool-call') toolCalls += 1
  }
  return { text, toolCalls }
}

/**
 * Decide whether this answer earns one more arm.
 * @param answer - the finished answer, or `undefined` before any answer exists.
 * @param used - attempts already consumed.
 * @param arms - configured arm order.
 * @param limits - per-turn and per-session caps.
 * @returns The arm to send, or `undefined` when the turn should end.
 */
export function planRetry(
  answer: Answer | undefined,
  used: Budget,
  arms: readonly ArmId[],
  limits: Limits,
): ArmId | undefined {
  if (answer === undefined) return undefined
  if (classifyAnswer(answer.text, answer.toolCalls) !== 'refused') return undefined
  if (used.turn >= limits.maxPerTurn || used.total >= limits.maxPerSession) return undefined
  return nextArm(used.turn, arms)
}

/**
 * Keep only the arms this build can send.
 * @param arms - configured arm numbers.
 * @returns The recognized arms in configuration order.
 */
export function configuredArms(arms: readonly number[]): ArmId[] {
  return arms.filter((arm): arm is ArmId => arm === 1 || arm === 2 || arm === 3)
}

/**
 * Read the newest assistant answer of a session.
 * @param agent - the agent whose session log supplies the answer.
 * @returns The answer, or `undefined` before the first answer.
 */
function lastAnswer(agent: Agent): Answer | undefined {
  // oxlint-disable-next-line typescript/no-deprecated -- no async reader exists at this seam
  const events = agent.session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'assistant/message') continue
    return readAnswer(event.data.message.content)
  }
  return undefined
}

/**
 * Install the guard on the agent lifecycle.
 * @param ctx - plugin context; the listener is scoped to it and disposed with it.
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const arms = configuredArms(config.arms ?? [1])
  if (arms.length === 0) return
  const limits: Limits = { maxPerTurn: config.maxPerTurn ?? 2, maxPerSession: config.maxPerSession ?? 6 }
  const budgets = new WeakMap<Agent, Budget>()
  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const answer = lastAnswer(agent)
    const used = budgets.get(agent) ?? { turn: 0, total: 0 }
    const arm = planRetry(answer, used, arms, limits)
    if (arm === undefined || answer === undefined) return
    budgets.set(agent, { turn: used.turn + 1, total: used.total + 1 })
    agent.session.append('refusal/retry', { turn, arm, verdict: 'refused', chars: answer.text.length })
    agent.steer(retryMessage(arm, `refusal retry · arm ${arm}`))
  })
}
