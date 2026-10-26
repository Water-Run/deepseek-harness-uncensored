/** Durable target rules and network admission; no model assessment grants permission. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { isIP } from 'node:net'
import { deadline } from '@deepseek-ai/dsh-timeout'
import type { HttpFetchDestination } from '@deepseek-ai/dsh-web-fetch-http'
import { canonicalTargetHost, TargetRules } from './rules.ts'
import { TargetStore } from './store.ts'
import { TargetProtectionError } from './errors.ts'
import { resolveRuleHost } from './dns.ts'
import type { NetworkTarget, TargetDecision, TargetPreferences, TargetRuleId, TargetSnapshot } from './types.ts'

export type * from './types.ts'
export { TargetProtectionError } from './errors.ts'
export { canonicalTargetHost, parseTargetPreferences, TargetRules } from './rules.ts'
export { TargetStore } from './store.ts'

/** Deployment-owned store and bounded resolution. */
export interface Config {
  /** Registry file belonging only to target protection. */
  path: string
  /** SQLite lock wait in milliseconds, default 1000. */
  busyTimeoutMs?: number
  /** Deadline for one address-aware check, default 5000 milliseconds. */
  checkTimeoutMs?: number
  /** Maximum rechecks after a concurrent settings change, default 3. */
  maxRechecks?: number
}
type ResolvedConfig = Required<Config>

declare module '@deepseek-ai/cordis' {
  interface Context { /** Current target registry and deterministic execution decisions. */ targetProtection: TargetProtection }
}

/** Root owner; the HTTP consumer requires this service and cannot fall back after its removal. */
export default class TargetProtection extends Service {
  static Config: schema<Config, ResolvedConfig> = schema.object({
    path: schema.string().required(), busyTimeoutMs: schema.natural().max(30000).default(1000),
    checkTimeoutMs: schema.natural().min(1).max(300000).default(5000), maxRechecks: schema.natural().min(1).max(20).default(3),
  })
  private readonly config: ResolvedConfig
  private readonly ready: Promise<TargetStore>
  private readonly lifetime = new AbortController()
  private readonly checking = new Set<Promise<unknown>>()

  /**
   * @param ctx - Service owner whose lifetime contains all pending checks.
   * @param config - Explicit path and deployment limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'targetProtection')
    this.config = TargetProtection.Config(config)
    this.ready = TargetStore.open(this.config.path, this.config.busyTimeoutMs)
    void this.ready.catch((_error: unknown) => { /* Service.init reports the failure; disposal also observes this promise. */ })
    ctx.effect(() => async () => {
      this.lifetime.abort(new TargetProtectionError('unavailable', 'Target protection is closing.'))
      await Promise.allSettled(this.checking)
      const opened = await Promise.allSettled([this.ready])
      if (opened[0].status === 'fulfilled') opened[0].value.close()
    }, 'target-protection.store')
  }

  /** Refuse activation when durable settings cannot be validated. */
  protected async [Service.init](): Promise<void> { await this.ready }

  /**
   * Read current committed settings; shutdown never supplies empty defaults.
   * @returns The latest durable revision and rule values.
   */
  async snapshot(): Promise<TargetSnapshot> {
    this.lifetime.signal.throwIfAborted()
    const store = await this.ready
    this.lifetime.signal.throwIfAborted()
    return store.snapshot()
  }

  /**
   * Save owner-selected preferences after a revision check.
   * @param preferences - Complete normalized rules.
   * @param expectedRevision - The caller's previously read revision.
   * @returns Committed successor settings.
   */
  async configure(preferences: TargetPreferences, expectedRevision: number): Promise<TargetSnapshot> {
    this.lifetime.signal.throwIfAborted()
    const store = await this.ready
    this.lifetime.signal.throwIfAborted()
    return store.configure(preferences, expectedRevision)
  }

  /**
   * Check the actual HTTP destination. Ordinary GET is treated as an unverified effect.
   * @param destination - Authority and pinned-address facts from the HTTP transport.
   * @param signal - Request cancellation and deadline.
   * @returns Stable rule decision; unavailable stores reject rather than granting permission.
   */
  checkHttp(destination: HttpFetchDestination, signal: AbortSignal): Promise<TargetDecision> {
    this.lifetime.signal.throwIfAborted()
    const operation = this.check(destination, signal)
    this.checking.add(operation)
    return operation.finally(() => { this.checking.delete(operation) })
  }

  private async check(destination: HttpFetchDestination, signal: AbortSignal): Promise<TargetDecision> {
    using timeout = deadline(AbortSignal.any([signal, this.lifetime.signal]), this.config.checkTimeoutMs, 'TARGET_CHECK_TIMEOUT')
    const target: NetworkTarget = {
      names: [canonicalTargetHost(destination.hostname)], port: destination.port,
      nameResolution: 'unknown',
      addresses: destination.phase === 'before-connect' && destination.route === 'direct'
        ? destination.addresses.map(address => address.address) : null,
      // IP-country classification is required before an unmarked target may pass mainland protection.
      mainland: 'unknown',
    }
    const store = await this.ready
    for (let attempt = 0; attempt < this.config.maxRechecks; attempt++) {
      timeout.signal.throwIfAborted()
      const snapshot = store.snapshot()
      const rules = new TargetRules(snapshot.preferences)
      const early = rules.preflight(target)
      if (early !== undefined) return early
      if (destination.phase === 'before-resolution') return { allowed: true, ruleIds: [] }
      const bindings = new Map<TargetRuleId, readonly string[] | null>()
      for (const rule of rules.namedHosts()) {
        timeout.signal.throwIfAborted()
        if (target.names.includes(rule.address) && target.addresses !== null) {
          bindings.set(rule.id, target.addresses)
          continue
        }
        try {
          const addresses = await resolveRuleHost(rule.address, timeout.signal)
          bindings.set(rule.id, addresses.length > 0 && addresses.every(address => isIP(address.address))
            ? addresses.map(address => canonicalTargetHost(address.address)) : null)
        } catch (error) {
          timeout.signal.throwIfAborted()
          if (!(typeof error === 'object' && error !== null && 'code' in error)) throw error
          bindings.set(rule.id, null)
        }
      }
      timeout.signal.throwIfAborted()
      if (store.snapshot().revision !== snapshot.revision) continue
      return rules.decide([target], 'unknown', bindings)
    }
    throw new TargetProtectionError('conflict', 'Target settings kept changing during validation; retry after changes settle.')
  }
}
