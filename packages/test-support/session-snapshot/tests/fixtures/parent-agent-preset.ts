/** Compose a blank headless Session within its creation maintenance task. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'

export const name = 'parent-agent-preset'
export const inject = ['agentPresets']

/**
 * Select the root Session's presets before its first model request.
 * @param ctx - Snapshot composition context with the preset roster.
 * @param config - Ordered preset selections; omission selects the parent preset once.
 */
export function apply(ctx: Context, config: { presets?: string[] } = {}): void {
  ctx.on('agent/created', async ({ agent }) => {
    if (agent.session.header.parentSession !== undefined) return
    for (const preset of config.presets ?? ['parent']) {
      const selected = await ctx.agentPresets.recompose(agent.ctx, preset)
      agent.session.append('agent-preset/selected', { agentPreset: selected.id })
    }
  }, { prepend: true })
}
