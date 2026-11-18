/** Control startup and shutdown of the Web restart test process. */
export const name = 'web-restart-startup'

/** Keep the carrier services and the launcher exit request available while startup is held. */
export const inject = ['typertGateway', 'connection', 'webServer', 'appExit']

/**
 * Provide the test-only dependency after startup has been released.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host plugin context.
 * @returns {Promise<void>} Once the barrier is released or the plugin is disposed.
 */
export async function apply(ctx) {
  if (typeof process.send !== 'function') throw new Error('web restart fixture requires an IPC channel')
  const shutdown = (message) => {
    if (message === 'shutdown-web-restart') ctx.appExit(0)
  }
  ctx.effect(() => {
    process.on('message', shutdown)
    return () => { process.off('message', shutdown) }
  }, 'web-restart: graceful shutdown')
  if (process.env.DSH_WEB_RESTART_HOLD_STARTUP === '1') {
    const released = Promise.withResolvers()
    const resume = (message) => {
      if (message === 'resume-startup') released.resolve(true)
    }
    ctx.effect(() => {
      process.on('message', resume)
      return () => {
        process.off('message', resume)
        released.resolve(false)
      }
    }, 'web-restart: startup barrier')
    process.send('startup-blocked')
    if (!await released.promise) return
  }
  ctx.reflect.provide('webRestartReady', {})
}
