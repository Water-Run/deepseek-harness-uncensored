/** Short Windows paths for native DLL loading during packaged-runtime verification. */
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * Verify a temporary copy at a short path without modifying the assembled application.
 * Windows native loaders exceed path limits in nested build journals; junctions are insufficient
 * because Electron and Office resolve them back to the original path.
 * @param application - Assembled application directory.
 * @param verify - Verification that drains its child processes before returning.
 * @returns The verification result, after removing the private temporary copy.
 */
export async function withPackagedSmokePath<T>(application: string, verify: (path: string) => Promise<T>): Promise<T> {
  const temporary = resolve(tmpdir())
  const parent = await mkdtemp(join(temporary, 'dsh-smoke-'))
  if (dirname(parent) !== temporary) throw new Error('Packaged smoke directory is outside the temporary root')
  const alias = join(parent, 'app')
  try {
    await cp(resolve(application), alias, { recursive: true, dereference: true, preserveTimestamps: true })
    return await verify(alias)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
}
