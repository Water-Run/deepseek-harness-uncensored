/** Read account UI options from the Host's public bootstrap data. */
import { ContactConfig, CONTACT_CONFIG_GLOBAL } from '../contact-config.ts'

/**
 * Resolve public bootstrap options for the account UI.
 * @returns Validated options with deployment defaults; contains no credentials.
 */
export function publicContactConfig(): ContactConfig {
  const page = globalThis as Partial<Record<typeof CONTACT_CONFIG_GLOBAL, unknown>>
  return ContactConfig(page[CONTACT_CONFIG_GLOBAL] ?? {})
}
