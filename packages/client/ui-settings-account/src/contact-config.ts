/** Public contact options shared by Host and Client. */
import z from '@deepseek-ai/schemastery'

/** Questionnaire destination shared by Host and Client. */
export interface ContactConfig {
  /** HTTPS questionnaire URL; override for a test form. */
  contactFormUrl: string
  /** Questionnaire source option; empty until Harness is supported by the form. */
  contactSource: string
  /** Deadline for one GitHub release check, including response parsing. */
  releaseCheckTimeoutMs: number
}
/** Validate public questionnaire options. */
export const ContactConfigFields = {
  contactFormUrl: z.string().pattern(/^https:\/\/[^/\s]+\//).default('https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose'),
  contactSource: z.string().default(''),
  releaseCheckTimeoutMs: z.natural().min(100).max(60_000).default(10_000),
}
/** Validate public questionnaire options. */
export const ContactConfig: z<Partial<ContactConfig>, ContactConfig> = z.object(ContactConfigFields)
/** Bootstrap key containing no account credentials. */
export const CONTACT_CONFIG_GLOBAL = '__DSH_CONTACT_CONFIG__'
