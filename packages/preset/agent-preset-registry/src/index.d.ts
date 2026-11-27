import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type ScopeKey } from '@deepseek-ai/dsh-scope';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { AgentPresetDocument, AgentPresetRoster, ModeSwitchChallenge, ModeSwitchChallengeId, ModeSwitchPolicy, SecurityEntryChallenge, SecurityEntryChallengeId, SecurityEntryLocale, SecurityEntryState, SensitiveConfirmationChallenge, SensitiveConfirmationChallengeId, SensitiveConfirmationPolicy } from './types.ts';
import { type PresetDefinition } from './definition.ts';
import type { AgentPreset, Config } from './preset.ts';
import { type AgentPresetComposition, type AgentPresetInspection } from './composition-inventory.ts';
export { agentPresetProjectionDefinition } from './session.ts';
export { entryListProblem, type PresetDefinition } from './definition.ts';
export { auditRows, leakedServices, type PresetMount, type RowAudit } from './mount.ts';
export type { AgentPresetInspection } from './composition-inventory.ts';
export type { AgentPreset, Config } from './preset.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        agentPresets: AgentPresetRegistry;
    }
}
/** Registry of YAML-declared presets and the revisions live Agents retain. */
export declare class AgentPresetRegistry extends TypertRemoteService {
    config: Config;
    static inject: string[];
    static Config: z<Schemastery.ObjectS<NoInfer<{
        default: z<string, string, "defined">;
        selectedDefault: z<string, string, "volatile">;
        allowExistingSessionSwitch: z<boolean, boolean, "volatile-defined">;
        securityEntryPreset: z<string, string, "volatile-defined">;
        requireSecurityEntryAcknowledgement: z<boolean, boolean, "volatile-defined">;
        sensitiveConfirmations: z<boolean, boolean, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        default: z<string, string, "defined">;
        selectedDefault: z<string, string, "volatile">;
        allowExistingSessionSwitch: z<boolean, boolean, "volatile-defined">;
        securityEntryPreset: z<string, string, "volatile-defined">;
        requireSecurityEntryAcknowledgement: z<boolean, boolean, "volatile-defined">;
        sensitiveConfirmations: z<boolean, boolean, "volatile-defined">;
    }>>, "plain">;
    private agentPresetProjectionHandle;
    private readonly owner;
    private readonly definitions;
    private readonly generations;
    private readonly bindings;
    private readonly switches;
    private readonly switchPermission;
    private readonly securityEntry;
    private sensitiveOverride;
    private readonly sensitiveConfirmations;
    constructor(ctx: Context, config: Config);
    protected [Service.init](): Promise<void>;
    /** Deployment default for new sessions; legacy saved user defaults are ignored. */
    get defaultId(): string;
    private assertPolicyOwner;
    /**
   * Read the runtime permission.
   * @returns Whether established conversations may change mode while idle.
   */
    switchPolicy(): ModeSwitchPolicy;
    /**
   * Begin owner acknowledgement.
   * @returns A fresh confirmation; it carries no reading while sensitive confirmations are off.
   */
    beginModeSwitch(): ModeSwitchChallenge;
    /**
     * Enable switching for this Host lifetime after explicit confirmation.
     * @param id - Acknowledgement returned by beginModeSwitch.
     * @returns Current permission after acceptance.
     */
    confirmModeSwitch(id: ModeSwitchChallengeId): ModeSwitchPolicy;
    /**
   * Revoke switching and any pending confirmation.
   * @returns Disabled permission.
   */
    disableModeSwitch(): ModeSwitchPolicy;
    private publishSwitchPolicy;
    /**
     * Read the sensitive-action confirmation preference.
     * @returns Whether sensitive actions still ask for an interactive confirmation.
     */
    sensitiveConfirmationPolicy(): SensitiveConfirmationPolicy;
    /**
     * Open the acknowledgement a preference change needs.
     * @param confirmations - Preference the change will commit.
     * @returns A challenge that carries the countdown only when confirmations are turned off.
     */
    beginSensitiveConfirmation(confirmations: boolean): SensitiveConfirmationChallenge;
    /**
     * Commit the preference after its acknowledgement, persisting it for later launches.
     * @param id - Challenge returned by beginSensitiveConfirmation.
     * @returns The committed preference.
     */
    confirmSensitiveConfirmation(id: SensitiveConfirmationChallengeId): Promise<SensitiveConfirmationPolicy>;
    private readSensitiveConfirmations;
    private persistSensitiveConfirmations;
    private publishSensitiveConfirmations;
    /**
     * Read the first-entry policy and the live protection state.
     * @returns Deployment policy, runtime acknowledgement, and provider status.
     */
    securityEntryState(): SecurityEntryState;
    /**
     * Open the first-entry challenge for one new main conversation.
     * @param sessionId - Blank top-level conversation the confirmation belongs to.
     * @param locale - Language of the declaration the Host will accept.
     * @returns Single-use challenge with the current protection snapshot.
     * @throws RemoteError `security-entry/disabled` when this deployment does not require the acknowledgement.
     * @throws RemoteError `security-entry/consumed` when this Host lifetime already acknowledged it.
     * @throws RemoteError `security-entry/session` when the target is not a new main conversation.
     */
    beginSecurityEntry(sessionId: SessionId, locale: SecurityEntryLocale): SecurityEntryChallenge;
    /**
     * Record the Host-lifetime acknowledgement after the reading interval and any declaration.
     * @param id - Challenge returned by beginSecurityEntry.
     * @param sessionId - Same conversation the challenge was opened for.
     * @param declaration - Exact declaration the challenge issued, or empty when protection is enabled.
     * @returns Updated runtime state.
     */
    confirmSecurityEntry(id: SecurityEntryChallengeId, sessionId: SessionId, declaration: string): SecurityEntryState;
    /**
     * Discard one pending challenge without granting the acknowledgement.
     * @param id - Challenge the client is closing.
     * @returns Runtime state after cancellation.
     */
    cancelSecurityEntry(id: SecurityEntryChallengeId): SecurityEntryState;
    /**
     * Refuse an explicit new-conversation preset until this Host recorded the acknowledgement.
     * Callers that compose no preset registry keep their existing behavior.
     * @param preset - Preset requested by a create call; undefined keeps the deployment default.
     */
    assertNewConversationPreset(preset: string | undefined): void;
    /**
     * Whether a new Security conversation still needs its first-entry acknowledgement.
     * @returns true when the deployment protects the preset and the owner kept sensitive confirmations on.
     */
    private securityEntryRequired;
    private assertSecurityEntryEnabled;
    private assertNewMainSession;
    private isNewMainSession;
    private assertSecurityEntrySelection;
    private readSecurityEntry;
    private publishSecurityEntry;
    private readProtection;
    /**
     * Read the preset recorded for a Session, including selections no longer in the roster.
     * @param session - Session whose committed preset selection is read.
     * @returns the recorded preset, or null when none was selected.
     */
    presetForSession(session: Session): string | null;
    /** Register and eagerly load a definition; activation failure remains visible in the roster.
     * @param definition Parsed configuration supplied by the declaring plugin.
     * @returns Definition disposer after activation or its diagnostic settles; the declaring plugin owns it.
     */
    register(definition: PresetDefinition): Promise<() => Promise<void>>;
    private activate;
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
    private diagnostic;
    private collect;
    private generationFor;
    /** Inspect retained revisions, or the exact revision an Agent joined.
     * @param ctx - optional Agent context; omission includes all retained revisions.
     * @returns detached module references and isolation diagnostics; no match returns an empty list.
     */
    inspectCompositions(ctx?: Context): AgentPresetInspection[];
    /** Read every declared preset, including activation failures.
     * @returns Display metadata and loading diagnostics.
     */
    list(): Promise<AgentPreset[]>;
    /** Read the selection roster.
     * @returns Current presets, each marked when it is the default.
     */
    remoteExportList(): Promise<AgentPresetRoster>;
    /** Resolve an identity without starting an Agent.
     * @param id Explicit preset or the current default.
     * @returns Current metadata, including failure when activation failed.
     */
    resolve(id?: string): Promise<AgentPreset>;
    /** Read one declaration's child plugin list as YAML, for viewing only.
     * @param agentPreset Preset identity.
     * @returns The declared composition beside its published metadata.
     */
    readDocument(agentPreset: string): Promise<AgentPresetDocument>;
    private retain;
    private bind;
    private join;
    /** Bind an unpublished Agent to the current preset revision.
     * @param ctx Agent context from its setup callback.
     * @param id Requested preset, or the default.
     * @returns Bound preset identity.
     */
    mount(ctx: Context, id?: string): Promise<AgentPreset>;
    /** Join a child to the exact revision retained by its parent.
     * @param ctx Child Agent context.
     * @param parent Parent Agent context.
     * @returns Inherited preset id, or undefined in a preset-free composition.
     */
    composeFrom(ctx: Context, parent: Context): string | undefined;
    /** Read the preset a live Agent uses.
     * @param ctx Agent context.
     * @returns Its preset id, if bound.
     */
    composedPreset(ctx: Context): string | undefined;
    /** Read a service supplied inside an Agent's isolated preset group.
     * @param agent Agent whose composition is queried.
     * @param name Cordis service name.
     * @returns The service, or undefined.
     */
    serviceFor<K extends string & keyof Context>(agent: {
        ctx: Context;
    }, name: K): Context[K] | undefined;
    /** Rebind an Agent; the caller must exclude concurrent model and tool execution.
     * @param ctx Agent context.
     * @param id Requested preset.
     * @returns The bound identity.
     */
    recompose(ctx: Context, id: string): Promise<AgentPreset>;
    /** Select a preset while idle, respecting the policy for established conversations. A Session whose
     * log records the preset and whose Agent runs its current revision keeps its
     * composition; nothing is logged or announced.
     * @param agent Target Agent.
     * @param agentPreset Requested identity.
     * @returns Committed preset identity.
     */
    select(agent: Agent, agentPreset: string): Promise<string>;
    /** Read current registrations for cold transcript presentation.
     * @param id Preset identity or the default.
     * @returns A revision lease; dispose it after the scoped read completes.
     */
    acquireScope(id?: string): Promise<{
        key: ScopeKey;
    } & AsyncDisposable>;
    /** Read plugin rows without creating an Agent.
     * @returns Current declaration metadata and activation states.
     */
    compositionInventory(): Promise<AgentPresetComposition[]>;
}
export default AgentPresetRegistry;
//# sourceMappingURL=index.d.ts.map