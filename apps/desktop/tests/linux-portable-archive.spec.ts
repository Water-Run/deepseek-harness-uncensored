import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { create } from 'tar'
import { expect, it } from 'vitest'
import { verifyLinuxPortableArchive } from '../scripts/verify-linux-portable-archive.ts'

const files = {
  'deepseek-harness-uncensored': 'owned executable',
  'resources/app.asar': 'packaged application',
  'resources/runtime/cli/bin/dsh-uncensored': 'owned launcher',
}

async function withArchive(launchMode: number, consume: (archive: string, application: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-portable-archive-'))
  const directory = 'portable application'
  const application = join(root, directory)
  const archive = join(root, 'portable.tar.gz')
  try {
    for (const [path, bytes] of Object.entries(files)) {
      const destination = join(application, path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes)
    }
    await create({ cwd: root, file: archive, gzip: true, onWriteEntry(entry) {
      if (entry.stat?.isFile()) {
        entry.stat.mode = (entry.stat.mode & ~0o777) | (entry.path.endsWith('/bin/dsh-uncensored') ? launchMode : 0o755)
      }
    } }, [directory])
    await consume(archive, application)
  } finally { await rm(root, { recursive: true, force: true }) }
}

it('compares the archived bytes with the assembled application, including same-size changes', async () => {
  await withArchive(0o755, async (archive, application) => {
    await expect(verifyLinuxPortableArchive(archive, application)).resolves.toBeUndefined()
    await writeFile(join(application, 'resources/app.asar'), files['resources/app.asar'].toUpperCase())
    await expect(verifyLinuxPortableArchive(archive, application)).rejects.toThrow('assembled file differs for resources/app.asar')
  })
})

it('rejects a portable CLI launcher that loses its executable mode', async () => {
  await withArchive(0o644, async (archive, application) => {
    await expect(verifyLinuxPortableArchive(archive, application)).rejects.toThrow('executable permission missing for resources/runtime/cli')
  })
})
