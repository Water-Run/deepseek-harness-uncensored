/** Apply electron-builder's dependency metadata cleanup before sealing runtime bytes. */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// electron-builder omits declarations for its internal manifest transformer.
const { createTransformer } = createRequire(import.meta.url)('app-builder-lib/out/fileTransformer.js') as {
  createTransformer: (root: string, config: object, extraMetadata: undefined) =>
  (path: string) => Promise<string | undefined> | null
}

/**
 * Materialize the same manifest bytes electron-builder will put in the archive.
 * @param root Prepared application dependency tree.
 * @param productVersion Build identity to stamp into the private CLI manifest, when packaging DSHU.
 * @returns Resolves after dependency manifests are ready for integrity inventory.
 */
export async function prepareRuntimeManifests(root: string, productVersion?: string): Promise<void> {
  if (productVersion !== undefined) {
    const path = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    const metadata: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof metadata !== 'object' || metadata === null || !('name' in metadata) || metadata.name !== '@deepseek-ai/dsh') {
      throw new Error('desktop runtime: expected the private CLI manifest before stamping its product version')
    }
    await writeFile(path, `${JSON.stringify({ ...metadata, dshProductVersion: productVersion }, null, 2)}\n`)
  }
  const transform = createTransformer(root, {}, undefined)
  const modules = join(root, 'node_modules')
  for (const entry of await readdir(modules, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name !== 'package.json') continue
    const path = join(entry.parentPath, entry.name)
    const transformed = await transform(path)
    if (transformed != null) await writeFile(path, transformed)
  }
}
