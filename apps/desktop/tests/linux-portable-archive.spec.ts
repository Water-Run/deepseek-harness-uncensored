import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { create } from 'tar'
import { expect, it } from 'vitest'
import { verifyLinuxDebianArchive } from '../scripts/verify-linux-debian-archive.ts'
import { verifyLinuxPortableArchive } from '../scripts/verify-linux-portable-archive.ts'

const files = {
  'deepseek-harness-uncensored': 'owned executable',
  'resources/app.asar': 'packaged application',
  'resources/runtime/cli/bin/dsh-uncensored': 'owned launcher',
}

async function withArchive(
  launchMode: number, consume: (archive: string, application: string) => Promise<void>, directory = 'portable application',
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dshu-portable-archive-'))
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

function debianMember(name: string, content: Buffer): Buffer {
  const header = name.padEnd(16) + '0'.padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6)
    + '100644'.padEnd(8) + String(content.length).padEnd(10) + '\x60\n'
  return Buffer.concat([Buffer.from(header), content, content.length % 2 === 0 ? Buffer.alloc(0) : Buffer.from('\n')])
}

it('selects the Debian data member after an odd-sized member and rejects a truncated payload', async () => {
  await withArchive(0o755, async (archive, application) => {
    const deb = join(dirname(archive), 'package.deb')
    const bytes = Buffer.concat([Buffer.from('!<arch>\n'), debianMember('debian-binary', Buffer.from('2.0\n')),
      debianMember('control.tar.gz', Buffer.from('x')), debianMember('data.tar.gz/', await readFile(archive))])
    await writeFile(deb, bytes)
    await expect(verifyLinuxDebianArchive(deb, application)).resolves.toBeUndefined()
    await writeFile(deb, bytes.subarray(0, -5))
    await expect(verifyLinuxDebianArchive(deb, application)).rejects.toThrow('member exceeds the package size')
  }, 'opt/DeepSeek Harness Uncensored')
})
