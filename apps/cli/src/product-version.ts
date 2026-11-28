/** Product version is independent of the embedded DSH plugin/runtime version. */
import { parseCalendarVersion } from '@deepseek-ai/dsh-product-version'
import { readFileSync } from 'node:fs'
import { valid } from 'semver'

/**
 * @returns The public DSHU calendar version or the original legacy release version.
 * @throws When package metadata is missing or invalid.
 */
export function cliProductVersion(): string {
  const metadata: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  if (typeof metadata !== 'object' || metadata === null || !('dshProductVersion' in metadata)
    || typeof metadata.dshProductVersion !== 'string') {
    throw new Error('dsh-uncensored: package.json must declare dshProductVersion')
  }
  const version = metadata.dshProductVersion
  const calendar = parseCalendarVersion(version)
  if (calendar !== undefined) return calendar.display
  // A four-digit year identifies a calendar build even in its three-field package form.
  if (!/^\d{4}\./u.test(version) && valid(version) === version) return version
  throw new Error('dsh-uncensored: invalid dshProductVersion in package.json: ' + JSON.stringify(version))
}
