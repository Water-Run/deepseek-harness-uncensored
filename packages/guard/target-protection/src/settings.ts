/** Owner Remote operations and live status for the guarded HTTP routes. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { SecurityProtectionCapability, SecurityProtectionStatus } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { TargetProtectionError } from '@deepseek-ai/dsh-target-protection'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { TargetAuditHistory } from './audit.ts'
import type { CountryDatabaseStatus } from './country.ts'
import type {} from './country-provider.ts'
import type {} from './index.ts'
import type { TargetPreferences, TargetSnapshot } from './types.ts'

export type { TargetAuditHistory, TargetAuditRecord, TargetAuditEntry, TargetAuditId } from './audit.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Present only while the ordinary HTTP route is registered with mandatory protection. */
    targetProtectedHttp: true
    /** Present only while the guarded independent proxy is mounted. */
    targetProtectedProxy: true
    /** Authenticated application owner's rule settings. */
    targetProtectionSettings: TargetProtectionSettings
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Rule settings require a live authenticated application owner. */
    'target-protection/owner-required': Record<string, never>
    'target-protection/invalid': Record<string, never>
    'target-protection/conflict': Record<string, never>
    'target-protection/busy': Record<string, never>
    'target-protection/unavailable': Record<string, never>
    'target-protection/unsupported-version': Record<string, never>
    'target-protection/unrecognized-store': Record<string, never>
    'target-protection/country-update-failed': Record<string, never>
  }
}

/** Current durable rules and the live enforcement and country-data status. */
export interface TargetProtectionSettingsState {
  snapshot: TargetSnapshot
  protection: SecurityProtectionStatus
  country: CountryDatabaseStatus | null
  /** Mounted guarded routes. Older Hosts omit this information. */
  routes?: TargetProtectionRoutes
  /** Available only for a provider with a managed DB-IP cache. */
  countryUpdateAvailable?: true
}

/** Which optional HTTP enforcement providers the Host has mounted. */
export interface TargetProtectionRoutes {
  readonly webFetch: boolean
  readonly independentProxy: boolean
}

/** Replace all rules only against the revision the owner edited. */
export interface TargetProtectionSettingsUpdate {
  preferences: TargetPreferences
  expectedRevision: number
}

const statusServices = new Set([
  'targetProtection', 'targetCountryData', 'targetProtectedHttp', 'targetProtectedProxy', 'securityProtection',
])

/** Connect durable rules and verified transport readiness to owner settings and Security entry. */
export default class TargetProtectionSettings extends TypertRemoteService {
  static inject = ['targetProtection']
  private statusRevision = 0
  private statusIdentity = ''

  /** @param ctx - Profile with the durable target registry and optional guarded transports. */
  constructor(ctx: Context) {
    super(ctx, 'targetProtectionSettings')
    const changed = () => {
      try { ctx.emit('security-protection/changed') }
      catch (error) { ctx.logger.warn('A security protection status observer failed.', error) }
      try { ctx.emit('target-protection/status-changed') }
      catch (error) { ctx.logger.warn('A target settings observer failed.', error) }
    }
    ctx.on('target-protection/changed', changed)
    ctx.on('target-country/changed', changed)
    ctx.on('internal/service', (name) => { if (statusServices.has(name)) changed() })
    ctx.provide('securityProtection', { read: () => this.readProtection() })
  }

  private ownerSignal(): AbortSignal {
    const invocation = this.ctx.invocation
    if (invocation?.peer.principal.kind !== 'owner') {
      throw new RemoteError('target-protection/owner-required', 'Only the connected application owner can access target rules.', {})
    }
    const signal = AbortSignal.any([invocation.signal, invocation.peer.signal])
    signal.throwIfAborted()
    return signal
  }

  private routes(): TargetProtectionRoutes {
    return { webFetch: this.ctx.get('targetProtectedHttp') === true, independentProxy: this.ctx.get('targetProtectedProxy') === true }
  }

  private readCountry(): CountryDatabaseStatus | null {
    try { return this.ctx.get('targetCountryData')?.status() ?? null }
    catch (error) {
      if (error instanceof TargetProtectionError && error.code === 'unavailable') return null
      throw error
    }
  }

  private readProtection(
    snapshot = this.ctx.get('targetProtection')?.currentSnapshot(), country = this.readCountry(), routes = this.routes(),
  ): SecurityProtectionStatus {
    const guarded = routes.webFetch && routes.independentProxy && snapshot !== undefined
    const capabilities: SecurityProtectionCapability[] = []
    if (guarded && snapshot.preferences.rules.some(rule => rule.enabled)) capabilities.push('target-rules')
    const state = !guarded ? 'unavailable' : !snapshot.preferences.mainlandEnabled ? 'disabled'
      : country?.state === 'ready' ? 'enabled' : 'unavailable'
    if (state === 'enabled') capabilities.unshift('mainland-domains')
    const identity = JSON.stringify([snapshot?.revision, country?.sha256, country?.state, routes, state, capabilities])
    if (identity !== this.statusIdentity) { this.statusIdentity = identity; this.statusRevision++ }
    return { state, capabilities, revision: this.statusRevision }
  }

  /**
   * Return the editable rule revision and current enforcement availability to the owner.
   * @returns Durable rule snapshot and live protected-route and country status.
   */
  @Remote
  get(): TargetProtectionSettingsState {
    this.ownerSignal()
    return this.state(this.ctx.targetProtection.currentSnapshot())
  }

  /**
   * Read recent redacted protection decisions for the authenticated owner.
   * @returns The audit availability and latest decisions, newest first.
   */
  @Remote
  auditHistory(): TargetAuditHistory {
    this.ownerSignal()
    return this.ctx.targetProtection.auditHistory()
  }

  private state(snapshot: TargetSnapshot): TargetProtectionSettingsState {
    const routes = this.routes(), country = this.readCountry()
    return { snapshot, routes, protection: this.readProtection(snapshot, country, routes), country,
      ...this.ctx.get('targetCountryData')?.canUpdate() === true ? { countryUpdateAvailable: true } : {} }
  }

  /**
   * Save one versioned rule edit for an authenticated owner.
   * @param update - Replacement settings and their expected revision.
   * @returns The new rule revision with the effective protection status.
   */
  @Remote
  async configure(update: TargetProtectionSettingsUpdate): Promise<TargetProtectionSettingsState> {
    const signal = this.ownerSignal()
    const routes = this.routes()
    if (!routes.webFetch || !routes.independentProxy) throw new RemoteError('target-protection/unavailable', 'The guarded HTTP routes are unavailable.', {})
    try {
      const snapshot = await this.ctx.targetProtection.configure(update.preferences, update.expectedRevision, signal)
      return this.state(snapshot)
    } catch (error) {
      if (error instanceof TargetProtectionError) throw new RemoteError(`target-protection/${error.code}`, error.message, {})
      throw error
    }
  }

  /**
   * Check the official DB-IP release and apply a verified newer country database for this Host.
   * @returns Live protection and country data status after the check.
   */
  @Remote
  async updateCountry(): Promise<TargetProtectionSettingsState> {
    const signal = this.ownerSignal()
    const provider = this.ctx.get('targetCountryData')
    if (provider === undefined || !provider.canUpdate()) {
      throw new RemoteError('target-protection/unavailable', 'Managed country updates are unavailable.', {})
    }
    try { await provider.update(signal) }
    catch (error) {
      if (error instanceof TargetProtectionError) {
        throw new RemoteError('target-protection/country-update-failed', error.message, {})
      }
      throw error
    }
    return this.state(this.ctx.targetProtection.currentSnapshot())
  }
}
