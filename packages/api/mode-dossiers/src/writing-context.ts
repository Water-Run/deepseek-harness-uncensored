/** Writing material admission and reconstruction from the conversation log. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { readSelectedMaterials } from './story.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Durable context this service injected on the user's behalf. */
    'mode-dossiers': { readonly kind: 'mode-dossiers' } & ContextFormed
  }
}

/** Agent preset whose requests receive the selected writing materials. */
const WRITING_PRESET = 'writing'

/**
 * Render the writing materials one request should receive.
 *
 * Only a Writing-mode request carries materials, and only the documents the
 * registry marks as selected are read: a file under `story/` that the user did
 * not select never reaches the model through this path.
 * @param fs - composed filesystem.
 * @param rootPath - the session's workspace directory.
 * @param preset - the preset composed for the agent.
 * @param budget - inclusive byte budget; 0 disables the context.
 * @param signal - request cancellation.
 * @returns the context text, or an empty string when nothing applies.
 */
export async function writingMaterialsText(
  fs: FileSystem,
  rootPath: string,
  preset: string | undefined,
  budget: number,
  signal: AbortSignal,
): Promise<string> {
  if (preset !== WRITING_PRESET || budget <= 0) return ''
  return readSelectedMaterials(fs, rootPath, budget, signal)
}

/**
 * Add the selected writing materials before one request.
 * @param ctx - Host context.
 * @param agent - agent whose step is being prepared.
 * @param signal - step cancellation.
 * @param contextBytes - complete writing-material byte budget.
 * @param admitted - whether this conversation has ever admitted writing materials.
 * @param next - the remaining pre-step chain.
 * @returns the decision, with the materials appended when this is a Writing step with a selection.
 */
async function extendRequest(
  ctx: Context,
  agent: Agent,
  signal: AbortSignal,
  contextBytes: number,
  admitted: ProjectionHandle<boolean>,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  const decision = await next()
  if (decision.kind === 'reject' || signal.aborted || contextBytes === 0) return decision
  if (ctx.get('agentPresets')?.composedPreset(agent.ctx) !== WRITING_PRESET) return decision
  const rootPath = agent.session.header.cwd ?? ctx.get('sandboxPolicy')?.workspaceRoot
  if (rootPath === undefined) return decision
  let text: string
  try {
    text = await writingMaterialsText(ctx.fs, rootPath, WRITING_PRESET, contextBytes, signal)
  } catch (error: unknown) {
    // Selected materials are optional context: a broken store must not fail the turn it would have joined.
    ctx.logger.warn('mode-dossiers: writing materials could not be read: %o', error)
    return decision
  }
  if (signal.aborted) return decision
  const previous = agent.session.deriveMessages().findLast(message => message.role === 'user' && message.source.kind === 'mode-dossiers')
  if (!text && !admitted.stateOf(agent.session)) return decision
  const current = text || 'No writing materials are currently selected. Disregard earlier writing-material instructions.'
  const block = previous?.content[0]
  if (block?.type === 'text' && block.text === current) return decision
  return {
    ...decision,
    messages: [...decision.messages, createUserMessage({
      content: [{ type: 'text', text: current }],
      source: { kind: 'mode-dossiers', form: 'instructions' },
    })],
  }
}

/**
 * Register the writing history projection and install the request hook once its history is ready.
 * @param ctx - owning plugin scope with session projections and filesystem.
 * @param contextBytes - maximum serialized material bytes for a writing step.
 */
export async function installWritingContext(ctx: Context, contextBytes: number): Promise<void> {
  if (contextBytes === 0) return
  const admitted = await ctx.sessionProjections.register({
    key: 'writingMaterialsAdmitted',
    stateVersion: 1,
    stateSchema: z.boolean(),
    init: () => false,
    apply: (seen, event) => seen || (event.type === 'user/message' && event.data.source.kind === 'mode-dossiers'),
  })
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => extendRequest(ctx, agent, signal, contextBytes, admitted, next))
}
