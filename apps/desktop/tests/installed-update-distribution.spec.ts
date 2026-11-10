import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { createInstalledUpdateRun } from '../scripts/installed-update-qualification.ts'
import { planInstalledUpdateDistribution } from '../scripts/installed-update-distribution.ts'

const versions = ['0.1.6-nightly.20260914.1', '0.1.6-nightly.20260914.2'] as const

async function fixture<T>(body: (manifest: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-update-distribution-'))
  try {
    const run = await createInstalledUpdateRun(directory, versions, { version: '0.1.5-rc.2', commit: 'a'.repeat(40), dirtyFiles: [] })
    for (const version of versions) {
      const output = join(run.root, version, 'installer')
      await mkdir(output, { recursive: true })
      const filename = `dshu-qualification-${version}-win-x64.exe`
      const body = Buffer.from(`inert fixture ${version}`)
      const installer = join(output, filename)
      await writeFile(installer, body)
      await buildBlockMap(installer, 'gzip', join(output, `${filename}.blockmap`))
      await writeFile(join(output, 'nightly.yml'), JSON.stringify({ version,
        files: [{ url: filename, size: body.length, sha512: createHash('sha512').update(body).digest('base64') }] }))
    }
    return await body(join(run.root, 'run.json'))
  } finally { await rm(directory, { recursive: true, force: true }) }
}

describe('qualification distribution file planning', () => {
  it('keeps two binary sets separate from successive bodies at one fixed feed URL without publication authority', async () => {
    await fixture(async (manifest) => {
      const [old, next] = await Promise.all(versions.map(version => planInstalledUpdateDistribution(manifest, version)))
      expect(old!.feed.url).toBe(next!.feed.url)
      expect(old!.feed.sha512).not.toBe(next!.feed.sha512)
      expect(old!.releaseTag).toBe(next!.releaseTag)
      expect(old!.binaries.map(file => file.name)).not.toEqual(next!.binaries.map(file => file.name))
      expect(next!.binaries).toHaveLength(2)
      const base = `https://github.com/Water-Run/deepseek-harness-uncensored/releases/download/${next!.releaseTag}/`
      expect(next!.binaries.map(file => file.url)).toEqual(next!.binaries.map(file => base + file.name))
      expect(next!.feed.url).toBe(base + 'nightly.yml')
      expect(next!.feed.contents).toBe(await readFile(join(next!.binaries[0]!.path, '..', 'nightly.yml'), 'utf8'))
      expect(next!.publicationAuthorized).toBe(false)
      expect(next!.verified).toBe('file-integrity-only')
      expect(load(next!.feed.contents)).toMatchObject({ version: versions[1],
        files: [{ url: next!.binaries[0]!.name }] })
    })
  })

  it('keeps the original gzip bytes when their blockmap matches the installer', async () => {
    await fixture(async (manifest) => {
      const original = await planInstalledUpdateDistribution(manifest, versions[0])
      const path = original.binaries[1]!.path
      const bytes = gzipSync(gunzipSync(await readFile(path)), { level: 1 })
      await writeFile(path, bytes)
      const updated = await planInstalledUpdateDistribution(manifest, versions[0])
      expect(updated.binaries[1]!.sha512).toBe(createHash('sha512').update(bytes).digest('base64'))
    })
  })

  it('rejects a valid blockmap from a different installer of the same size', async () => {
    await fixture(async (manifest) => {
      const [old, next] = await Promise.all(versions.map(version => planInstalledUpdateDistribution(manifest, version)))
      expect(old!.binaries[0]!.size).toBe(next!.binaries[0]!.size)
      await writeFile(next!.binaries[1]!.path, await readFile(old!.binaries[1]!.path))
      await expect(planInstalledUpdateDistribution(manifest, versions[1])).rejects.toThrow('external blockmap differs')
    })
  })

  it('rejects a nonempty blockmap with invalid gzip bytes', async () => {
    await fixture(async (manifest) => {
      const plan = await planInstalledUpdateDistribution(manifest, versions[0])
      await writeFile(plan.binaries[1]!.path, 'invalid blockmap')
      await expect(planInstalledUpdateDistribution(manifest, versions[0])).rejects.toThrow('invalid external blockmap')
    })
  })

  it.each(['changed-bytes', 'missing-map', 'foreign-url', 'wrong-version', 'legacy-hash', 'invalid-utf8', 'web-package'])(
    'rejects %s before producing any distribution plan', async (failure) => {
      await fixture(async (manifest) => {
        const plan = await planInstalledUpdateDistribution(manifest, versions[0])
        const installer = plan.binaries[0]!.path
        const metadataPath = join(installer, '..', 'nightly.yml')
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
          version: string
          files: { url: string }[]
          sha512?: string
          packages?: object
        }
        if (failure === 'changed-bytes') await writeFile(installer, 'changed')
        if (failure === 'missing-map') await rm(plan.binaries[1]!.path)
        if (failure === 'foreign-url') metadata.files[0]!.url = 'https://other.invalid/unrelated.exe'
        if (failure === 'wrong-version') metadata.version = versions[1]
        if (failure === 'legacy-hash') metadata.sha512 = 'wrong'
        if (failure === 'web-package') metadata.packages = { x64: { path: 'https://other.invalid/alternate.7z' } }
        const body = Buffer.from(JSON.stringify(metadata))
        await writeFile(metadataPath, failure === 'invalid-utf8' ? Buffer.concat([body, Buffer.from([10, 35, 255])]) : body)
        await expect(planInstalledUpdateDistribution(manifest, versions[0])).rejects.toThrow()
      })
    },
  )
})
