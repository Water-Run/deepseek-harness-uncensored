import type { Volatile } from '@deepseek-ai/cordis'
/** Public preset roster and selection configuration. */
/** One declared preset and its current activation failure, if any. */
export interface AgentPreset {
  readonly id: string
  readonly name?: string
  readonly description?: string
  readonly order?: number
  readonly broken?: string
}

/** Registry selection policy. */
export interface Config {
  /** Deployment default when the caller omits a preset. */
  default: string
  /** Legacy saved value, accepted for existing configuration files but ignored. */
  selectedDefault: Volatile<string | undefined>
  /** Legacy saved value, accepted for existing configuration files but ignored; permission requires runtime confirmation. */
  allowExistingSessionSwitch: Volatile<boolean>
  /** Preset that carries the first-entry acknowledgement policy. */
  securityEntryPreset: Volatile<string>
  /** Whether a new main conversation must acknowledge Security mode once per Host lifetime. */
  requireSecurityEntryAcknowledgement: Volatile<boolean>
  /** Whether sensitive actions ask for an interactive confirmation; the owner turns it off behind a countdown. */
  sensitiveConfirmations: Volatile<boolean>
}
