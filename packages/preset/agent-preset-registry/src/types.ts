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
  interface Events {
    /**
     * Established-conversation mode switching permission changed for this Host lifetime.
     * @mode emit
     * @param policy - Current runtime permission.
     */
    'agent-preset/switch-policy'(policy: ModeSwitchPolicy): void
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
