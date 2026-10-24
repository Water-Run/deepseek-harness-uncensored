/** Client-safe payloads and event declarations owned by the agent-preset domain. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Single-use acknowledgement for enabling established-conversation mode changes. */
export type ModeSwitchChallengeId = Branded<'ModeSwitchChallengeId'>

/** Runtime-only permission; every new Host starts disabled. */
export interface ModeSwitchPolicy {
  readonly allowExistingSessionSwitch: boolean
}

/** Acknowledgement issued by the Host, with a minimum reading duration. */
export interface ModeSwitchChallenge {
  readonly id: ModeSwitchChallengeId
  readonly waitMs: number
}

/** Single-use acknowledgement for the first new Security conversation of a Host lifetime. */
export type SecurityEntryChallengeId = Branded<'SecurityEntryChallengeId'>

/** Language of the declaration the Host will accept for one challenge. */
export type SecurityEntryLocale = 'zh' | 'en'

/** Runtime state of the protection backend that watches domestic websites. */
export type SecurityProtectionState = 'enabled' | 'disabled' | 'unavailable'

/** One protection capability the provider currently enforces. */
export type SecurityProtectionCapability = 'mainland-domains' | 'target-rules'

/**
 * Live protection state reported by the backend, never a configuration mirror.
 *
 * `revision` must increase whenever `state` or `capabilities` changes so a
 * confirmation opened under older conditions can be refused.
 */
export interface SecurityProtectionStatus {
  /** Enabled and usable, explicitly disabled, or unknown because no backend answered. */
  readonly state: SecurityProtectionState
  /** Monotonic provider revision of the complete status. */
  readonly revision: number
  /** Capabilities the running backend enforces. */
  readonly capabilities: readonly SecurityProtectionCapability[]
}

/**
 * Optional protection backend a deployment may compose.
 *
 * The Web product ships no provider today: `ctx.get('securityProtection')`
 * returns undefined and the acknowledgement reports protection as unavailable.
 * A provider must emit `security-protection/changed` after a status change.
 */
export interface SecurityProtectionProvider {
  /** @returns Current runtime status; a thrown read is reported as unavailable. */
  read(): SecurityProtectionStatus
}

/** First-entry policy a client reads from the Host. */
export interface SecurityEntryState {
  /** Whether this deployment requires the first-entry acknowledgement. */
  readonly required: boolean
  /** Preset identity the acknowledgement protects. */
  readonly preset: string
  /** Whether this Host lifetime already recorded the acknowledgement. */
  readonly acknowledged: boolean
  /** Live protection state at read time. */
  readonly protection: SecurityProtectionStatus
}

/** Host-issued challenge for one new main conversation. */
export interface SecurityEntryChallenge {
  /** Single-use identity; replaced by every new challenge. */
  readonly id: SecurityEntryChallengeId
  /** Minimum reading duration before the Host accepts a confirmation. */
  readonly waitMs: number
  /** Exact declaration to type; empty when protection is enabled and available. */
  readonly declaration: string
  /** Protection state the challenge was issued under. */
  readonly protection: SecurityProtectionStatus
}

/**
 * One declared preset as a client reads it.
 */
export interface AgentPresetRow {
  /** Stable identifier; also the label's fallback. */
  readonly id: string
  /** Whether a session naming no preset composes this one. */
  readonly isDefault: boolean
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
  /** Why this preset cannot compose a session; absent when it can. */
  readonly broken?: string
}

/** The roster one deployment currently supplies. */
export interface AgentPresetRoster {
  /** Every current declaration, including activation failures. */
  readonly presets: readonly AgentPresetRow[]
}

/** One preset's declared composition, rendered for reading. */
export interface AgentPresetDocument {
  /** The preset the composition belongs to. */
  readonly agentPreset: string
  /** The declared child plugin list as entry-list YAML, `!!js` expressions included. */
  readonly content: string
  /** Display name the preset published. */
  readonly name?: string
  /** One sentence on what this preset is for. */
  readonly description?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No declaration supplies the requested identity. */
    'agent-preset/not-found': { readonly agentPreset: string; readonly available: readonly string[] }
    /** The id is unusable, already taken, or its composition cannot be installed. */
    'agent-preset/invalid': { readonly agentPreset: string; readonly reason: string }
    /** The session is running, or policy prevents changing an established conversation. */
    'agent-preset/locked': { readonly sessionId: SessionId; readonly agentPreset: string }
    /** Only the application owner can change the temporary switching permission. */
    'agent-preset/policy-denied': Record<string, never>
    /** The challenge is absent, expired, replaced, or not yet ready. */
    'agent-preset/confirmation': { readonly remainingMs: number }
    /** A new Security conversation needs the first-entry acknowledgement. */
    'security-entry/required': { readonly protection: SecurityProtectionStatus }
    /** This deployment does not compose the confirmation policy. */
    'security-entry/disabled': Record<string, never>
    /** The target is not a blank top-level conversation owned by a live Agent. */
    'security-entry/session': { readonly sessionId: SessionId }
    /** The challenge is absent, expired, or replaced. */
    'security-entry/confirmation': { readonly remainingMs: number }
    /** The reading interval has not elapsed. */
    'security-entry/wait': { readonly remainingMs: number }
    /** The typed declaration does not match the one issued with the challenge. */
    'security-entry/declaration': { readonly declaration: string }
    /** Protection changed after the challenge was issued. */
    'security-entry/changed': { readonly protection: SecurityProtectionStatus }
    /** Another window already consumed the challenge or the Host acknowledged this launch. */
    'security-entry/consumed': { readonly acknowledged: boolean }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    agentPreset: string | null
  }
  interface SessionProjectionMap {
    /** Preset the Session runs, or null when the deployment composes none. */
    agentPreset: string | null
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional protection backend; resolve with `ctx.get('securityProtection')`.
     * The Web product composes none, so reads report `unavailable`.
     */
    securityProtection: SecurityProtectionProvider
  }
  interface Events {
    /**
     * The protection provider's runtime status or revision changed.
     * @mode emit
     */
    'security-protection/changed'(): void
    /**
     * Established-conversation mode switching permission changed for this Host lifetime.
     * @mode emit
     * @param policy - Current runtime permission.
     */
    'agent-preset/switch-policy'(policy: ModeSwitchPolicy): void
    /**
     * First-entry acknowledgement or live protection state changed.
     * @mode emit
     * @param state - Current deployment policy and protection state.
     */
    'agent-preset/security-entry'(state: SecurityEntryState): void
    /**
     * One session committed a different agent preset to its durable log.
     * Consumers invalidate only state derived from that session's composition.
     * @mode emit
     * @param sessionId - the session whose composition changed.
     * @param agentPreset - the preset recorded by the committed selection.
     */
    'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
  }
}

export {}
