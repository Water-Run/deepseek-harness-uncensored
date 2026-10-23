/** Product version is independent of the embedded DSH plugin/runtime version. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** @returns The Uncensored version sealed into this CLI package. @throws When package metadata is missing or invalid. */
export function cliProductVersion(): string {
  const metadata: unknown = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  if (typeof metadata !== 'object' || metadata === null || !('dshProductVersion' in metadata)
    || typeof metadata.dshProductVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(metadata.dshProductVersion)) {
    throw new Error('dsh-uncensored: package.json must declare dshProductVersion')
  }
  return metadata.dshProductVersion
}
