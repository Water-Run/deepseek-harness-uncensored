/** Declarative Agent capability sets, activation and session binding. */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { bindScopeParent, createScope, scopeOf, scopeParentOf, type Scope, type ScopeKey, type ScopeParentBinding } from '@deepseek-ai/dsh-scope'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { dump } from 'js-yaml'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: the optional `settings` service this registry keeps off the generated pages.
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import type {
  AgentPresetDocument, AgentPresetRoster, ModeSwitchChallenge, ModeSwitchChallengeId, ModeSwitchPolicy,
  SecurityEntryChallenge, SecurityEntryChallengeId, SecurityEntryLocale, SecurityEntryState, SecurityProtectionStatus,
  SensitiveConfirmationChallenge, SensitiveConfirmationChallengeId, SensitiveConfirmationPolicy,
} from './types.ts'
import { ModeSwitchPermission } from './switch-policy.ts'
import { SecurityEntryPermission, UNAVAILABLE_PROTECTION } from './security-entry.ts'
import { SensitiveConfirmationPermission } from './sensitive-confirmations.ts'
import { entryListProblem, type PresetDefinition } from './definition.ts'
import type { AgentPreset, Config } from './preset.ts'
import { agentPresetProjectionDefinition } from './session.ts'
import { auditRows, leakedServices, mountPreset, serviceForMount, type PresetMount } from './mount.ts'
import { activeCompositionModules, definitionComposition, mountedCompositionRows, type AgentPresetComposition, type AgentPresetInspection } from './composition-inventory.ts'

export { agentPresetProjectionDefinition } from './session.ts'
export { entryListProblem, type PresetDefinition } from './definition.ts'
export { auditRows, leakedServices, type PresetMount, type RowAudit } from './mount.ts'
export type { AgentPresetInspection } from './composition-inventory.ts'
export type { AgentPreset, Config } from './preset.ts'

/** Profile entry id this service reads its own live preferences from. */
const SETTINGS_NS = 'agent-preset-registry'

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentPresets: AgentPresetRegistry
  }
}

interface Generation {
  scope: Scope
  key: ScopeKey
  mount: PresetMount
  users: number
  retired: boolean
}
interface Definition {
  config: PresetDefinition
  context: Context
  ready: Promise<void>
  generation?: Generation
  /**
 * Mount failure; unset while a tree is mounted, whose rows {@link AgentPresetRegistry.diagnostic} re-audits on read.
 */
  broken?: string
}
interface Binding {
  parent: ScopeParentBinding
  generation: Generation
}

/** Registry of YAML-declared presets and the revisions live Agents retain. */
export class AgentPresetRegistry extends TypertRemoteService {
  static inject = ['loader', 'sessionProjections']
  static Config = z.object({
    default: z.string().required(),
    selectedDefault: z.string().volatile(),
    allowExistingSessionSwitch: z.boolean().default(false).volatile(),
    securityEntryPreset: z.string().default('security').volatile(),
    requireSecurityEntryAcknowledgement: z.boolean().default(false).volatile(),
    sensitiveConfirmations: z.boolean().default(true).volatile(),
  })
  private readonly owner: Context
  private readonly definitions = new Map<string, Definition>()
  private readonly generations = new Map<ScopeKey, Generation>()
  private readonly bindings = new WeakMap<ScopeKey, Binding>()
  private readonly switches = new Map<string, Promise<unknown>>()
  private readonly switchPermission = new ModeSwitchPermission()
  private readonly securityEntry = new SecurityEntryPermission(() => this.readProtection())
  // Set only when the preference cannot be persisted: a deployment composing no
  // settings service still honors the owner's choice for this Host lifetime.
  private sensitiveOverride: boolean | undefined
  private readonly sensitiveConfirmations = new SensitiveConfirmationPermission(
    () => this.sensitiveOverride ?? this.config.sensitiveConfirmations.get(),
  )

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'agentPresets')
    this.owner = ctx
    ctx.sessionProjections.register(agentPresetProjectionDefinition)
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
    ctx.on('session/event', (session, event) => {
      if (event.type === 'agent-preset/selected') ctx.emit('agent-preset/selected', session.id, event.data.agentPreset)
    })
    // A provider that changes conditions invalidates any open challenge; the
    // client refetches and starts a fresh reading interval.
    ctx.on('security-protection/changed', () => {
      this.securityEntry.invalidate()
      this.publishSecurityEntry()
    })
  }

  /** Deployment default for new sessions; legacy saved user defaults are ignored. */
  get defaultId(): string { return this.config.default }

  private assertPolicyOwner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('agent-preset/policy-denied', 'Only the application owner can change this permission.', {})
    }
  }

  /**
 * Read the runtime permission.
 * @returns Whether established conversations may change mode while idle.
 */
  @Remote('switchPolicy')
  switchPolicy(): ModeSwitchPolicy { return this.switchPermission.read() }

  /**
 * Begin owner acknowledgement.
 * @returns A fresh confirmation; it carries no reading while sensitive confirmations are off.
 */
  @Remote('beginModeSwitch')
  beginModeSwitch(): ModeSwitchChallenge {
    this.assertPolicyOwner()
    return this.switchPermission.begin(this.sensitiveConfirmations.read() ? undefined : 0)
  }

  /**
   * Enable switching for this Host lifetime after explicit confirmation.
   * @param id - Acknowledgement returned by beginModeSwitch.
   * @returns Current permission after acceptance.
   */
  @Remote('confirmModeSwitch')
  confirmModeSwitch(id: ModeSwitchChallengeId): ModeSwitchPolicy {
    this.assertPolicyOwner()
    return this.publishSwitchPolicy(this.switchPermission.confirm(id))
  }

  /**
 * Revoke switching and any pending confirmation.
 * @returns Disabled permission.
 */
  @Remote('disableModeSwitch')
  disableModeSwitch(): ModeSwitchPolicy {
    this.assertPolicyOwner()
    return this.publishSwitchPolicy(this.switchPermission.disable())
  }

  private publishSwitchPolicy(policy: ModeSwitchPolicy): ModeSwitchPolicy {
    try { this.owner.emit('agent-preset/switch-policy', policy) }
    catch (error) { this.owner.logger.warn('Mode switching permission observer failed.', error) }
    return policy
  }

  /**
   * Read the sensitive-action confirmation preference.
   * @returns Whether sensitive actions still ask for an interactive confirmation.
   */
  @Remote('sensitiveConfirmationPolicy')
  sensitiveConfirmationPolicy(): SensitiveConfirmationPolicy { return this.readSensitiveConfirmations() }

  /**
   * Open the acknowledgement a preference change needs.
   * @param confirmations - Preference the change will commit.
   * @returns A challenge that carries the countdown only when confirmations are turned off.
   */
  @Remote('beginSensitiveConfirmation')
  beginSensitiveConfirmation(confirmations: boolean): SensitiveConfirmationChallenge {
    this.assertPolicyOwner()
    return this.sensitiveConfirmations.begin(confirmations)
  }

  /**
   * Commit the preference after its acknowledgement, persisting it for later launches.
   * @param id - Challenge returned by beginSensitiveConfirmation.
   * @returns The committed preference.
   */
  @Remote('confirmSensitiveConfirmation')
  async confirmSensitiveConfirmation(id: SensitiveConfirmationChallengeId): Promise<SensitiveConfirmationPolicy> {
    this.assertPolicyOwner()
    const confirmations = this.sensitiveConfirmations.confirm(id)
    // An open security-entry challenge was issued under the old preference and
    // must not survive the guard being removed or restored.
    this.securityEntry.invalidate()
    await this.persistSensitiveConfirmations(confirmations)
    this.publishSecurityEntry()
    return this.publishSensitiveConfirmations()
  }

  private readSensitiveConfirmations(): SensitiveConfirmationPolicy {
    return { confirmations: this.sensitiveConfirmations.read() }
  }

  private async persistSensitiveConfirmations(confirmations: boolean): Promise<void> {
    const settings = this.ctx.get('settings')
    if (settings === undefined) {
      this.sensitiveOverride = confirmations
      return
    }
    try {
      await settings.update(SETTINGS_NS, { sensitiveConfirmations: confirmations })
      // The committed document now carries the value; a per-launch override would shadow later edits.
      this.sensitiveOverride = undefined
    } catch (error) {
      this.ctx.logger.warn('Sensitive-confirmation preference could not be saved; applying it to this launch only.', error)
      this.sensitiveOverride = confirmations
    }
  }

  private publishSensitiveConfirmations(): SensitiveConfirmationPolicy {
    const policy = this.readSensitiveConfirmations()
    try { this.owner.emit('agent-preset/sensitive-confirmations', policy) }
    catch (error) { this.owner.logger.warn('Sensitive-confirmation observer failed.', error) }
    return policy
  }

  /**
   * Read the first-entry policy and the live protection state.
   * @returns Deployment policy, runtime acknowledgement, and provider status.
   */
  @Remote('securityEntryState')
  securityEntryState(): SecurityEntryState { return this.readSecurityEntry() }

  /**
   * Open the first-entry challenge for one new main conversation.
   * @param sessionId - Blank top-level conversation the confirmation belongs to.
   * @param locale - Language of the declaration the Host will accept.
   * @returns Single-use challenge with the current protection snapshot.
   * @throws RemoteError `security-entry/disabled` when this deployment does not require the acknowledgement.
   * @throws RemoteError `security-entry/consumed` when this Host lifetime already acknowledged it.
   * @throws RemoteError `security-entry/session` when the target is not a new main conversation.
   */
  @Remote('beginSecurityEntry')
  beginSecurityEntry(sessionId: SessionId, locale: SecurityEntryLocale): SecurityEntryChallenge {
    this.assertPolicyOwner()
    this.assertSecurityEntryEnabled()
    if (this.securityEntry.read().acknowledged) {
      throw new RemoteError('security-entry/consumed', 'The security-mode notice is already confirmed for this launch.', { acknowledged: true })
    }
    this.assertNewMainSession(sessionId)
    return this.securityEntry.begin(sessionId, locale)
  }

  /**
   * Record the Host-lifetime acknowledgement after the reading interval and any declaration.
   * @param id - Challenge returned by beginSecurityEntry.
   * @param sessionId - Same conversation the challenge was opened for.
   * @param declaration - Exact declaration the challenge issued, or empty when protection is enabled.
   * @returns Updated runtime state.
   */
  @Remote('confirmSecurityEntry')
  confirmSecurityEntry(id: SecurityEntryChallengeId, sessionId: SessionId, declaration: string): SecurityEntryState {
    this.assertPolicyOwner()
    this.assertSecurityEntryEnabled()
    this.securityEntry.confirm(sessionId, id, declaration)
    return this.publishSecurityEntry()
  }

  /**
   * Discard one pending challenge without granting the acknowledgement.
   * @param id - Challenge the client is closing.
   * @returns Runtime state after cancellation.
   */
  @Remote('cancelSecurityEntry')
  cancelSecurityEntry(id: SecurityEntryChallengeId): SecurityEntryState {
    this.assertPolicyOwner()
    this.securityEntry.cancel(id)
    return this.publishSecurityEntry()
  }

  /**
   * Refuse an explicit new-conversation preset until this Host recorded the acknowledgement.
   * Callers that compose no preset registry keep their existing behavior.
   * @param preset - Preset requested by a create call; undefined keeps the deployment default.
   */
  assertNewConversationPreset(preset: string | undefined): void {
    const required = this.securityEntryRequired()
    if (preset === undefined || !required || preset !== this.config.securityEntryPreset.get()) return
    const state = this.securityEntry.read()
    if (state.acknowledged) return
    throw new RemoteError('security-entry/required', 'Confirm the security-mode notice before starting this conversation.', {
      protection: state.protection,
    })
  }

  /**
   * Whether a new Security conversation still needs its first-entry acknowledgement.
   * @returns true when the deployment protects the preset and the owner kept sensitive confirmations on.
   */
  private securityEntryRequired(): boolean {
    return this.config.requireSecurityEntryAcknowledgement.get() && this.sensitiveConfirmations.read()
  }

  private assertSecurityEntryEnabled(): void {
    if (!this.securityEntryRequired()) {
      throw new RemoteError('security-entry/disabled', 'Security-entry acknowledgement is not enabled for this deployment.', {})
    }
  }

  private assertNewMainSession(sessionId: SessionId): void {
    const agent = this.ctx.get('agents')?.get(sessionId)
    if (agent === undefined || agent.status !== 'idle' || !this.isNewMainSession(agent.session)) {
      throw new RemoteError('security-entry/session', 'Open a new main conversation before confirming security mode.', { sessionId })
    }
  }

  private isNewMainSession(session: Agent['session']): boolean {
    const header = session.header
    if (header.parentSession !== undefined || header.origin === 'subagent') return false
    const boundary = this.owner.sessionProjections.stateOf(session, 'turnBoundary')
    return boundary === undefined || (boundary.openTurnStartSeq === null && boundary.lastTurn === 0)
  }

  private assertSecurityEntrySelection(agent: Agent, agentPreset: string): void {
    const required = this.securityEntryRequired()
    if (!required || agentPreset !== this.config.securityEntryPreset.get()) return
    if (this.owner.sessionProjections.stateOf(agent.session, 'agentPreset') === agentPreset) return
    const boundary = this.owner.sessionProjections.stateOf(agent.session, 'turnBoundary')
    if (boundary !== undefined && (boundary.openTurnStartSeq !== null || boundary.lastTurn > 0)) return
    const state = this.securityEntry.read()
    if (state.acknowledged) return
    throw new RemoteError('security-entry/required', 'Confirm the security-mode notice before starting this conversation.', {
      protection: state.protection,
    })
  }

  private readSecurityEntry(): SecurityEntryState {
    return {
      required: this.securityEntryRequired(),
      preset: this.config.securityEntryPreset.get(),
      ...this.securityEntry.read(),
    }
  }

  private publishSecurityEntry(): SecurityEntryState {
    const state = this.readSecurityEntry()
    try { this.owner.emit('agent-preset/security-entry', state) }
    catch (error) { this.owner.logger.warn('Security-entry state observer failed.', error) }
    return state
  }

  private readProtection(): SecurityProtectionStatus {
    const provider = this.ctx.get('securityProtection')
    if (provider === undefined) return UNAVAILABLE_PROTECTION
    try {
      const status = provider.read()
      return { state: status.state, revision: status.revision, capabilities: [...status.capabilities] }
    } catch (error) {
      this.ctx.logger.warn('Security protection status is unavailable.', error)
      return UNAVAILABLE_PROTECTION
    }
  }

  /** Register and eagerly load a definition; activation failure remains visible in the roster.
   * @param definition Parsed configuration supplied by the declaring plugin.
   * @returns Definition disposer after activation or its diagnostic settles; the declaring plugin owns it.
   */
  async register(definition: PresetDefinition): Promise<() => Promise<void>> {
    const context = this.ctx
    if (!definition.id.trim()) throw new Error('Preset id must not be empty')
    if (this.definitions.has(definition.id)) throw new Error(`Duplicate agent preset: ${definition.id}`)
    const record: Definition = { config: definition, context, ready: Promise.resolve() }
    this.definitions.set(definition.id, record)
    let disposed = false
    const unregister = async (): Promise<void> => {
      if (disposed) return
      disposed = true
      this.definitions.delete(definition.id)
      await record.ready
      if (record.generation !== undefined) {
        record.generation.retired = true
        await this.collect(record.generation)
      }
    }
    record.ready = this.activate(record)
    await record.ready
    return unregister
  }

  private async activate(record: Definition): Promise<void> {
    const key = {}
    const scope = createScope(this.owner, key)
    try {
      const problem = entryListProblem(record.config.plugins)
      if (problem !== undefined) throw new Error(problem)
      const context = scope.ctx.extend({ baseUrl: record.context.baseUrl })
      const mount = await mountPreset(context, record.config.id, record.config.plugins)
      const generation: Generation = { scope, key, mount, users: 0, retired: false }
      context.effect(() => {
        this.generations.set(key, generation)
        return () => { this.generations.delete(key) }
      }, 'agent-preset.mount')
      record.generation = generation
    } catch (error) {
      record.broken = (error as Error).message
      this.owner.logger.warn(`agent preset ${record.config.id}: ${record.broken}`)
      await scope.dispose()
    }
  }

  /**
   * Current activation diagnostic of a definition.
   *
   * A mount failure is final. A mounted tree is re-audited on every read: a
   * row waiting for a Host service activates by itself once that provider
   * finishes, so the audit waits for the Host Loader tree to settle before
   * reporting the row as unusable. Callers therefore must not run inside a
   * Host row's own activation, which the settlement would wait on.
   * @param record - the definition to audit.
   * @returns one line per unusable row, or undefined when the definition is usable.
   */
  private async diagnostic(record: Definition): Promise<string | undefined> {
    await record.ready
    if (record.generation === undefined) return record.broken
    const tree = record.generation.mount.tree
    let audit = await auditRows(tree)
    if (audit.pending.length > 0) {
      await this.owner.loader.await()
      audit = await auditRows(tree)
    }
    const lines = [...audit.failed, ...audit.pending]
    return lines.length === 0 ? undefined : lines.join('\n')
  }

  private async collect(generation: Generation): Promise<void> {
    if (!generation.retired || generation.users !== 0) return
    this.generations.delete(generation.key)
    await generation.scope.dispose()
  }

  private generationFor(ctx: Context): Generation | undefined {
    const key = scopeOf(ctx)
    const parent = key === undefined ? undefined : scopeParentOf(key)
    return parent === undefined ? undefined : this.generations.get(parent)
  }

  /** Inspect retained revisions, or the exact revision an Agent joined.
   * @param ctx - optional Agent context; omission includes all retained revisions.
   * @returns detached module references and isolation diagnostics; no match returns an empty list.
   */
  inspectCompositions(ctx?: Context): AgentPresetInspection[] {
    const joined = ctx === undefined ? undefined : this.generationFor(ctx)
    const generations = ctx === undefined ? [...this.generations.values()] : joined === undefined ? [] : [joined]
    return generations.map(({ mount }) => ({
      id: mount.presetId,
      modules: activeCompositionModules(mount.tree),
      leakedServices: leakedServices(this.owner, mount.fiber),
    }))
  }

  /** Read every declared preset, including activation failures.
   * @returns Display metadata and loading diagnostics.
   */
  async list(): Promise<AgentPreset[]> {
    const rows = await Promise.all([...this.definitions.values()].map(async (record) => {
      const broken = await this.diagnostic(record)
      return {
        id: record.config.id,
        ...(record.config.name === undefined ? {} : { name: record.config.name }),
        ...(record.config.description === undefined ? {} : { description: record.config.description }),
        ...(record.config.order === undefined ? {} : { order: record.config.order }),
        ...(broken === undefined ? {} : { broken }),
      }
    }))
    return rows.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id))
  }

  /** Read the selection roster.
   * @returns Current presets, each marked when it is the default.
   */
  @Remote('list')
  async remoteExportList(): Promise<AgentPresetRoster> {
    const defaultId = this.defaultId
    return { presets: (await this.list()).filter(row => this.definitions.get(row.id)?.config.hidden !== true)
      .map(row => ({ ...row, isDefault: row.id === defaultId })) }
  }

  /** Resolve an identity without starting an Agent.
   * @param id Explicit preset or the current default.
   * @returns Current metadata, including failure when activation failed.
   */
  async resolve(id?: string): Promise<AgentPreset> {
    const wanted = id ?? this.defaultId
    const record = this.definitions.get(wanted)
    if (record === undefined) throw new RemoteError('agent-preset/not-found', `Unknown agent preset: ${wanted}`,
      { agentPreset: wanted, available: [...this.definitions.keys()] })
    const broken = await this.diagnostic(record)
    return { id: wanted, ...(broken === undefined ? {} : { broken }) }
  }

  /** Read one declaration's child plugin list as YAML, for viewing only.
   * @param agentPreset Preset identity.
   * @returns The declared composition beside its published metadata.
   */
  @Remote('read')
  readDocument(agentPreset: string): Promise<AgentPresetDocument> {
    const record = this.definitions.get(agentPreset)
    if (record === undefined) {
      return Promise.reject(new RemoteError('agent-preset/not-found', `Unknown agent preset: ${agentPreset}`,
        { agentPreset, available: [...this.definitions.keys()] }))
    }
    const { id, name, description, plugins } = record.config
    // The Loader's own dialect, so `!!js` conditions read as declared rather than as expression objects.
    const content = dump(plugins, { schema: entryListSchema, noRefs: true, lineWidth: -1 })
    return Promise.resolve({
      agentPreset: id, content, ...(name === undefined ? {} : { name }), ...(description === undefined ? {} : { description }),
    })
  }

  private async retain(id?: string): Promise<Generation> {
    const wanted = id ?? this.defaultId
    while (true) {
      const record = this.definitions.get(wanted)
      if (record === undefined) throw new RemoteError('agent-preset/not-found', `Unknown agent preset: ${wanted}`,
        { agentPreset: wanted, available: [...this.definitions.keys()] })
      const broken = await this.diagnostic(record)
      if (this.definitions.get(wanted) !== record) continue
      const generation = record.generation
      if (broken !== undefined || generation === undefined) {
        const reason = broken as string
        throw new RemoteError('agent-preset/invalid', reason, { agentPreset: wanted, reason })
      }
      generation.users++
      return generation
    }
  }

  private async bind(ctx: Context, generation: Generation): Promise<void> {
    const key = scopeOf(ctx)
    if (key === undefined) throw new Error('Agent preset binding requires a scoped context')
    const binding = this.bindings.get(key)
    if (binding?.generation === generation) return
    if (binding !== undefined) {
      binding.parent.rebind(generation.key)
      const old = binding.generation
      generation.users++
      binding.generation = generation
      old.users--
      await this.collect(old)
    } else this.join(ctx, key, generation)
  }

  private join(ctx: Context, key: ScopeKey, generation: Generation): void {
    const binding = { parent: bindScopeParent(key, generation.key), generation }
    generation.users++
    this.bindings.set(key, binding)
    ctx.effect(() => async () => {
      this.bindings.delete(key)
      binding.generation.users--
      await this.collect(binding.generation)
    }, 'agent-preset.binding')
  }

  /** Bind an unpublished Agent to the current preset revision.
   * @param ctx Agent context from its setup callback.
   * @param id Requested preset, or the default.
   * @returns Bound preset identity.
   */
  async mount(ctx: Context, id?: string): Promise<AgentPreset> {
    const generation = await this.retain(id)
    try {
      await this.bind(ctx, generation)
      return { id: generation.mount.presetId }
    } finally {
      generation.users--
      await this.collect(generation)
    }
  }

  /** Join a child to the exact revision retained by its parent.
   * @param ctx Child Agent context.
   * @param parent Parent Agent context.
   * @returns Inherited preset id, or undefined in a preset-free composition.
   */
  composeFrom(ctx: Context, parent: Context): string | undefined {
    const generation = this.generationFor(parent)
    if (generation === undefined) {
      if (parent.get('agentPresets')?.composedPreset(parent) !== undefined) {
        throw new Error('Parent preset revision is unavailable')
      }
      return undefined
    }
    // A child has no existing binding, so this path has no asynchronous cleanup.
    const key = scopeOf(ctx)
    if (key === undefined) throw new Error('Child preset binding requires a scope')
    if (this.bindings.has(key)) throw new Error('Child already joined a preset')
    this.join(ctx, key, generation)
    return generation.mount.presetId
  }

  /** Read the preset a live Agent uses.
   * @param ctx Agent context.
   * @returns Its preset id, if bound.
   */
  composedPreset(ctx: Context): string | undefined { return this.generationFor(ctx)?.mount.presetId }

  /** Read a service supplied inside an Agent's isolated preset group.
   * @param agent Agent whose composition is queried.
   * @param name Cordis service name.
   * @returns The service, or undefined.
   */
  serviceFor<K extends string & keyof Context>(agent: { ctx: Context }, name: K): Context[K] | undefined {
    const mount = this.generationFor(agent.ctx)?.mount
    return mount === undefined ? undefined : serviceForMount(this.owner, mount, name)
  }

  /** Rebind an Agent; the caller must exclude concurrent model and tool execution.
   * @param ctx Agent context.
   * @param id Requested preset.
   * @returns The bound identity.
   */
  async recompose(ctx: Context, id: string): Promise<AgentPreset> {
    const preset = await this.mount(ctx, id)
    try { this.owner.emit('tools/change') }
    catch (error) { this.owner.logger.warn(`Preset tools observer: ${String(error)}`) }
    return preset
  }

  /** Select a preset while idle, respecting the policy for established conversations. A Session whose
   * log records the preset and whose Agent runs its current revision keeps its
   * composition; nothing is logged or announced.
   * @param agent Target Agent.
   * @param agentPreset Requested identity.
   * @returns Committed preset identity.
   */
  @Remote('select')
  async select(agent: Agent, agentPreset: string): Promise<string> {
    const turn = (this.switches.get(agent.id) ?? Promise.resolve()).then(async () => {
      const boundary = this.owner.sessionProjections.stateOf(agent.session, 'turnBoundary')
      if (agent.status !== 'idle' || boundary?.openTurnStartSeq != null) {
        throw new RemoteError('agent-preset/locked', 'Wait for the current task to finish before changing its mode', {
          sessionId: agent.id, agentPreset,
        })
      }
      // A new conversation entering Security needs this Host lifetime's first-entry
      // acknowledgement; established conversations keep the temporary switch policy below.
      this.assertSecurityEntrySelection(agent, agentPreset)
      if (boundary !== undefined && boundary.lastTurn > 0 && !this.switchPermission.read().allowExistingSessionSwitch) {
        throw new RemoteError('agent-preset/locked', 'Changing an existing conversation mode is disabled in Settings', {
          sessionId: agent.id, agentPreset,
        })
      }
      const current = this.definitions.get(agentPreset)?.generation
      if (current !== undefined && this.generationFor(agent.ctx) === current
        && this.owner.sessionProjections.stateOf(agent.session, 'agentPreset') === agentPreset) return agentPreset
      const maintenance = { entered: false }
      try {
        return await agent.runMaintenance(async () => {
          maintenance.entered = true
          const preset = await this.recompose(agent.ctx, agentPreset)
          agent.session.append('agent-preset/selected', { agentPreset: preset.id })
          return preset.id
        })
      } catch (error) {
        if (!maintenance.entered) throw new RemoteError('agent-preset/locked', 'Wait for session maintenance to finish before changing its mode', {
          sessionId: agent.id, agentPreset,
        })
        throw error
      }
    })
    const guard = turn.catch(() => undefined)
    this.switches.set(agent.id, guard)
    try { return await turn } finally {
      if (this.switches.get(agent.id) === guard) this.switches.delete(agent.id)
    }
  }

  /** Read current registrations for cold transcript presentation.
   * @param id Preset identity or the default.
   * @returns A revision lease; dispose it after the scoped read completes.
   */
  async acquireScope(id?: string): Promise<{ key: ScopeKey } & AsyncDisposable> {
    const generation = await this.retain(id)
    let disposed = false
    return { key: generation.key, [Symbol.asyncDispose]: async () => {
      if (disposed) return
      disposed = true
      generation.users--
      await this.collect(generation)
    } }
  }

  /** Read plugin rows without creating an Agent.
   * @returns Current declaration metadata and activation states.
   */
  compositionInventory(): Promise<AgentPresetComposition[]> {
    return Promise.all([...this.definitions.values()].map(async (record) => {
      const { id, name, description } = record.config
      const broken = await this.diagnostic(record)
      const read = definitionComposition(record.config.plugins, () => { throw new Error('Inactive definition') })
      return { id, ...(name === undefined ? {} : { name }), ...(description === undefined ? {} : { description }),
        isDefault: id === this.defaultId,
        ...(broken === undefined ? {} : { broken }),
        rows: record.generation === undefined ? ('rows' in read ? read.rows : []) : mountedCompositionRows(record.generation.mount.tree) }
    }))
  }
}
export default AgentPresetRegistry
