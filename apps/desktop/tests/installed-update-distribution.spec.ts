import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { createInstalledUpdateRun } from '../scripts/installed-update-qualification.ts'
import { planInstalledUpdateDistribution } from '../scripts/installed-update-distribution.ts'
import { verifyWindowsInstallerChecksum } from '../scripts/verify-windows-installer-blockmap.ts'

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

  it.each(['changed-bytes', 'missing-map', 'missing-feed', 'foreign-url', 'wrong-version', 'feed-size', 'feed-hash', 'legacy-hash', 'invalid-utf8', 'web-package'])(
    'rejects %s before producing any distribution plan', async (failure) => {
      await fixture(async (manifest) => {
        const plan = await planInstalledUpdateDistribution(manifest, versions[0])
        const installer = plan.binaries[0]!.path
        const metadataPath = join(installer, '..', 'nightly.yml')
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
          version: string
          files: { url: string; size: number; sha512: string }[]
          sha512?: string
          packages?: object
        }
        if (failure === 'changed-bytes') await writeFile(installer, 'changed')
        if (failure === 'missing-map') await rm(plan.binaries[1]!.path)
        if (failure === 'foreign-url') metadata.files[0]!.url = 'https://other.invalid/unrelated.exe'
        if (failure === 'wrong-version') metadata.version = versions[1]
        if (failure === 'feed-size') metadata.files[0]!.size++
        if (failure === 'feed-hash') metadata.files[0]!.sha512 = createHash('sha512').update('unrelated fixture').digest('base64')
        if (failure === 'legacy-hash') metadata.sha512 = 'wrong'
        if (failure === 'web-package') metadata.packages = { x64: { path: 'https://other.invalid/alternate.7z' } }
        const body = Buffer.from(JSON.stringify(metadata))
        await writeFile(metadataPath, failure === 'invalid-utf8' ? Buffer.concat([body, Buffer.from([10, 35, 255])]) : body)
        if (failure === 'missing-feed') await rm(metadataPath)
        await expect(planInstalledUpdateDistribution(manifest, versions[0])).rejects.toThrow()
      })
    },
  )
})

describe('release installer SHA-256 companion', () => {
  it('matches the exact installer in a Windows-formatted checksum list', async () => {
    await fixture(async (manifest) => {
      const installer = (await planInstalledUpdateDistribution(manifest, versions[0])).binaries[0]!
      const checksums = join(dirname(installer.path), 'SHA256SUMS.txt')
      const hash = createHash('sha256').update(await readFile(installer.path)).digest('hex')
      await writeFile(checksums, `\uFEFF${hash}  another.exe\r\n${hash.toUpperCase()} *${installer.name}\r\n`)
      await expect(verifyWindowsInstallerChecksum(installer.path, checksums, installer)).resolves.toBe(hash)
    })
  })

  it.each([
    { failure: 'missing', message: 'manifest omits the installer' },
    { failure: 'duplicate', message: 'duplicate SHA-256 entry' },
    { failure: 'case-duplicate', message: 'duplicate SHA-256 entry' },
    { failure: 'wrong-case', message: 'manifest omits the installer' },
    { failure: 'bad-digest', message: 'SHA-256 differs from the manifest' },
    { failure: 'malformed', message: 'malformed SHA-256 manifest' },
    { failure: 'changed-installer', message: 'installer changed after blockmap verification' },
  ])('refuses $failure', async ({ failure, message }) => {
    await fixture(async (manifest) => {
      const installer = (await planInstalledUpdateDistribution(manifest, versions[0])).binaries[0]!
      const checksums = join(dirname(installer.path), 'SHA256SUMS.txt')
      if (failure === 'changed-installer') await writeFile(installer.path, 'different installer')
      const hash = createHash('sha256').update(await readFile(installer.path)).digest('hex')
      let text = `${hash}  ${installer.name}\n`
      if (failure === 'missing') text = `${hash}  another.exe\n`
      if (failure === 'duplicate') text += text
      if (failure === 'case-duplicate') text = `${'0'.repeat(64)}  ${installer.name.toUpperCase()}\n${text}`
      if (failure === 'wrong-case') text = `${hash}  ${installer.name.toUpperCase()}\n`
      if (failure === 'bad-digest') text = `${'0'.repeat(64)}  ${installer.name}\n`
      if (failure === 'malformed') text = `${hash} ${installer.name}\n`
      await writeFile(checksums, text)
      await expect(verifyWindowsInstallerChecksum(installer.path, checksums, installer)).rejects.toThrow(message)
    })
  })
})
