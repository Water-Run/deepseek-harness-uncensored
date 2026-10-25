import { mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { withPackagedSmokePath } from '../scripts/packaged-smoke-path.ts'

it.each([false, true])('removes its private copy while retaining the original application on failure=%s', async (fail) => {
  const original = await mkdtemp(join(tmpdir(), 'dsh-smoke-target-'))
  const file = join(original, 'payload.txt')
  let alias = ''
  try {
    await writeFile(file, 'retained application')
    const operation = withPackagedSmokePath(original, async (path) => {
      alias = path
      expect(await realpath(path)).not.toBe(await realpath(original))
      expect(await readFile(join(path, 'payload.txt'), 'utf8')).toBe('retained application')
      if (fail) throw new Error('verification failed')
      return 'verified'
    })
    if (fail) await expect(operation).rejects.toThrow('verification failed')
    else await expect(operation).resolves.toBe('verified')
    await expect(realpath(alias)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(realpath(dirname(alias))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(file, 'utf8')).toBe('retained application')
  } finally {
    await unlink(file)
    await rmdir(original)
  }
})
