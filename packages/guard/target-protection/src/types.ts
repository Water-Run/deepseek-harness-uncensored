/** Owner rules and executor-supplied target identities. @module */
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable owner-managed rule identity. */
export type TargetRuleId = Branded<'TargetRuleId'>

/** One named production resource or exact test exception. */
export interface TargetRule {
  id: TargetRuleId
  name: string
  enabled: boolean
  kind: 'domain' | 'server' | 'database'
  environment: 'production' | 'test'
  protection: 'full' | 'audit'
  match: 'host' | 'domain' | 'regex' | 'cidr' | 'path'
  address: string
  port?: number
  database?: string
}

/** Rules persist independently of conversation history. */
export interface TargetPreferences {
  mainlandEnabled: boolean
  rules: TargetRule[]
}

/** Current committed preferences and their monotonic revision. */
export interface TargetSnapshot {
  revision: number
  preferences: TargetPreferences
}

/** Transport identity; callers obtain these facts from execution, never model assertions. */
export interface NetworkTarget {
  /** Requested hostname and verified DNS aliases; no credentials or URL query. */
  names: readonly string[]
  /** Whether the executor verified the complete name chain used for this connection. */
  nameResolution: 'verified' | 'unknown'
  /** Addresses actually pinned to the connection; null means the transport resolves elsewhere. */
  addresses: readonly string[] | null
  port?: number
  /** Protocol-verified database identity; omission does not mean a non-production database. */
  database?: string
  /** Region of every pinned address, supplied by a separately verified classifier. */
  mainland: 'yes' | 'no' | 'unknown'
}

/** Fresh resolution of an exact protected hostname. Null means resolution failed or is unavailable. */
export type RuleAddresses = ReadonlyMap<TargetRuleId, readonly string[] | null>

/** Read-only effects must be guaranteed by the executing operation. HTTP GET or a model label is insufficient. */
export type TargetEffect = 'observe' | 'mutate' | 'unconfined' | 'unknown'

/** Stable rejection codes for execution, UI and later durable audit projection. */
export type TargetDenialCode = 'TARGET_FULLY_PROTECTED' | 'TARGET_READ_ONLY' | 'TARGET_IDENTITY_UNVERIFIED' | 'TARGET_MAINLAND_PROTECTED' | 'TARGET_OWNER_RESOURCE' | 'TARGET_EXECUTION_UNCONFINED'

/** Deterministic result; a test exception cannot replace a production denial. */
export type TargetDecision = { allowed: true; ruleIds: readonly TargetRuleId[] }
  | { allowed: false; code: TargetDenialCode; ruleIds: readonly TargetRuleId[] }
