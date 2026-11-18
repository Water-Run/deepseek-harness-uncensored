/** Verify the external blockmap for a final Windows installer. */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'

interface FileDigest {
  readonly size: number
  readonly sha512: string
}

/**
 * Check the external blockmap against the final installer bytes without modifying either file.
 * @param installer - Installer to inventory, after any signing has finished.
 * @param blockmap - Blockmap to verify, which defaults to the adjacent installer sidecar.
 * @returns Installer size and SHA-512, plus the original blockmap's size and SHA-512.
 */
export async function verifyWindowsInstallerBlockmap(
  installer: string, blockmap = `${installer}.blockmap`,
): Promise<{ digest: FileDigest; map: FileDigest }> {
  const scratch = await mkdtemp(join(tmpdir(), 'dshu-blockmap-'))
  const generated = join(scratch, 'installer.blockmap')
  try {
    const bytes = await readFile(blockmap)
    const { size, sha512 } = await buildBlockMap(installer, 'gzip', generated)
    if (size === undefined) throw new Error('desktop installer: blockmap verification returned no installer size')
    const expected = gunzipSync(await readFile(generated))
    let actual: Buffer
    try {
      actual = gunzipSync(bytes, { maxOutputLength: expected.length })
    } catch (cause) {
      throw new Error('desktop installer: invalid external blockmap', { cause })
    }
    if (!actual.equals(expected)) throw new Error('desktop installer: external blockmap differs from the installer')
    return { digest: { size, sha512 }, map: { size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') } }
  } finally {
    await rm(generated, { force: true })
    await rmdir(scratch)
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  const installer = process.argv[2]
  if (installer === undefined || process.argv.length !== 3) throw new Error('desktop installer: expected one installer filename')
  await verifyWindowsInstallerBlockmap(resolve(installer))
}
