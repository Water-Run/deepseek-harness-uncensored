/**
 * Security-mode egress proxy provider.
 *
 * One Host-wide service owns the configured upstream, the bounded capture store,
 * and one loopback chain proxy per conversation. Only the `security` preset is
 * covered; every other mode keeps its existing network behavior, and no control
 * plane traffic (model API, sign-in, balance, updates) is routed here because the
 * dispatcher is private to this plugin rather than installed globally.
 * @module @deepseek-ai/dsh-security-proxy-local
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-security-proxy'
import schema from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CaptureStore } from './capture.ts'
import { SecurityProxyEngine, type PasswordVault } from './engine.ts'
import { SecurityProxyService } from './service.ts'
import { PROXY_PASSWORD_REF, SettingsStore } from './settings.ts'

export { SecurityProxyService } from './service.ts'
export { SECURITY_PRESET, SecurityProxyEngine } from './engine.ts'
export type { PasswordVault } from './engine.ts'

/** Deployment-owned file path plus the transport limits the proxy enforces. */
export interface Config {
  /** Absolute settings file path inside the product's data directory. */
  path: string
  /** Host the connection check asks the upstream to reach. */
  testHost?: string
  /** Port the connection check asks the upstream to reach. */
  testPort?: number
  /** Whole-handshake budget for the check and CONNECT tunnels, in milliseconds. */
  connectTimeoutMs?: number
  /** Whole-request budget for forwarded and controlled requests, in milliseconds. */
  requestTimeoutMs?: number
  /** Same-origin redirect hops the controlled Client follows. */
  maxRedirects?: number
  /** Decoded body character cap for the controlled Client. */
  maxBodyChars?: number
  /** Response byte cap for the controlled Client. */
  maxResponseBytes?: number
  /** `User-Agent` the controlled Client sends. */
  userAgent?: string
}

/** Deployment defaults are stated here; the settings file owns user choices. */
export const Config = schema.object({
  path: schema.string().required(),
  testHost: schema.string().default('example.com'),
  testPort: schema.number().step(1).min(1).max(65_535).default(443),
  connectTimeoutMs: schema.number().step(1).min(100).max(120_000).default(8_000),
  requestTimeoutMs: schema.number().step(1).min(100).max(600_000).default(60_000),
  maxRedirects: schema.number().step(1).min(0).max(20).default(5),
  maxBodyChars: schema.number().step(1).min(1_000).max(1_000_000).default(100_000),
  maxResponseBytes: schema.number().step(1).min(1_024).max(50_000_000).default(5_000_000),
  userAgent: schema.string().default('deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'),
})

/** Cordis plugin name used by loader diagnostics. */
export const name = 'security-proxy-local'

/** Services this provider reads. */
export const inject = ['credentials']

/** Complete config after schemastery applies every default. */
type ResolvedConfig = Required<Config>

/**
 * Mount the proxy runtime, its Remote surface, and its session lifecycle hooks.
 * @param ctx - application scope.
 * @param config - validated deployment config.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved = config as ResolvedConfig
  const store = await SettingsStore.open(resolved.path)
  if (store.failure !== null) ctx.logger.warn(`security-proxy: ${store.failure}; defaults are in force and the proxy stays off`)

  const capture = new CaptureStore(() => {
    const settings = store.value
    return {
      maxFlows: settings.maxFlows,
      maxBodyBytes: settings.maxBodyBytes,
      retentionMs: settings.retentionMinutes * 60_000,
    }
  })

  const presets = new Map<string, string>()
  const callbacks = {
    store,
    capture,
    vault: createVault(ctx),
    presetOf: (agent: Agent): string => recordedPreset(agent, presets),
    sessionIdOf: (agent: Agent): SessionId => agent.session.id,
    testTarget: { host: resolved.testHost, port: resolved.testPort },
    connectTimeoutMs: resolved.connectTimeoutMs,
    requestTimeoutMs: resolved.requestTimeoutMs,
    maxRedirects: resolved.maxRedirects,
    maxBodyChars: resolved.maxBodyChars,
    maxResponseBytes: resolved.maxResponseBytes,
    userAgent: resolved.userAgent,
    warnDisabled: (sessionId: SessionId): void => { ctx.emit('security-proxy/warning', sessionId) },
  }
  const engine = new SecurityProxyEngine(callbacks)
  const service = ctx.plugin(SecurityProxyService, engine)
  const stopSessionEvent = ctx.on('session/event', (session, event) => {
    if (event.type === 'agent-preset/selected') presets.set(session.id, event.data.agentPreset)
  })
  const stopSession = ctx.on('session/disposed', (session) => {
    presets.delete(session.id)
    engine.forgetSession(session.id)
  })
  // A configured proxy is verified once at startup so the surface reports a real
  // state instead of claiming the last remembered one.
  if (store.value.enabled) {
    void engine.test().catch((error: unknown) => {
      ctx.logger.warn('security-proxy: startup connection check failed')
      ctx.logger.warn(error)
    })
  }
  ctx.effect(() => async () => {
    stopSessionEvent()
    stopSession()
    await engine.dispose()
    await service.dispose()
  }, 'security-proxy: upstream, listeners, and capture')
  await service.await()
}

/**
 * The session's recorded preset. The durable log is the only authority; a tool
 * argument can never claim a mode.
 *
 * A selection is read from the committed log the first time a session is asked
 * about and then from live `agent-preset/selected` events, so a blank session's
 * change and a resumed session's recorded choices agree.
 * @param agent - the executing Agent.
 * @param cache - resolved presets per session.
 * @returns the preset id, defaulting to `standard` when none is recorded.
 */
function recordedPreset(agent: Agent, cache: Map<string, string>): string {
  const cached = cache.get(agent.session.id)
  if (cached !== undefined) return cached
  const selected = latestSelection(agent.session)
  const resolved = selected ?? agent.session.header.agentPreset ?? 'standard'
  cache.set(agent.session.id, resolved)
  return resolved
}

/** The last committed preset selection in one session log, if any. */
function latestSelection(session: Session): string | undefined {
  const events = session.snapshotEvents()
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event: SessionEvent | undefined = events[index]
    if (event?.type === 'agent-preset/selected') return event.data.agentPreset
  }
  return undefined
}

/**
 * Bind the credential store to the proxy password record. The value is resolved
 * per operation, so a changed credential reaches the next request.
 * @param ctx - context carrying the credential provider.
 * @returns the vault the engine reads.
 */
function createVault(ctx: Context): PasswordVault {
  const ref = credentialRef(PROXY_PASSWORD_REF)
  return {
    present: async () => (await ctx.credentials.describe(ref)).configured,
    resolve: async () => (await ctx.credentials.resolve(ref))?.value,
    save: async (value) => {
      if (value === null) await ctx.credentials.unset(ref)
      else await ctx.credentials.set(ref, value)
    },
  }
}
