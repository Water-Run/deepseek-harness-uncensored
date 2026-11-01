/** Authored summary-route rejection for the image-compaction snapshot. */
export const name = 'summary-image-budget'
export const inject = ['llm', 'tokenMeter']

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - Scenario-local context.
 */
export function apply(ctx) {
  let failed = false
  let pressure
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'compaction/start' || failed) return
    const measurement = ctx.tokenMeter.measure(session)
    const visualPremium = measurement.nodes.reduce((sum, node) => sum + node.tokens - node.heuristicTokens, 0)
    const { contextWindow } = ctx.tokenMeter.contextPressure(session)
    pressure = {
      visual: measurement.totalTokens,
      text: measurement.totalTokens - visualPremium,
      threshold: contextWindow === undefined ? 0 : Math.floor(contextWindow * 0.8),
    }
  })
  ctx.on('llm/stream', async function* (options, next) {
    if (options.purpose !== 'compaction' || failed) {
      yield* next()
      return
    }
    if (!pressure || pressure.text > pressure.threshold || pressure.visual <= pressure.threshold) {
      throw new Error(`Image pricing must be the compaction trigger: ${JSON.stringify(pressure)}`)
    }
    failed = true
    yield {
      type: 'finish',
      reason: { kind: 'error', failure: {
        code: 'IMAGE_OFFLOAD_REQUIRED', message: 'authored summary image budget failure', offloadImages: 1,
      } },
    }
  })
}
