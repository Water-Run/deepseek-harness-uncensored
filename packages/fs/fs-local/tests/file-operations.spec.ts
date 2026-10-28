/** Native single-file effects, freshness, non-overwrite publication and partial failures. @module */
import { Context } from '@deepseek-ai/cordis'
import { FsTargetKey, type FsTarget } from '@deepseek-ai/dsh-fs'
import { mkdtemp, realpath, writeFile, readFile, mkdir, rm, symlink, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import LocalFileSystem from '../src/index.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function harness() {
  const allocated = await mkdtemp(join(tmpdir(), 'dshu-file-operations-')); roots.push(allocated)
  const root = await realpath(allocated)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  const fs = ctx.fs as LocalFileSystem
  const file = async (name: string, content = 'source') => {
    await writeFile(join(root, name), content)
    return fs.resolve(name)
  }
  const observed = async (target: FsTarget) => {
    const info = await fs.stat(target)
    if (info === undefined) throw new Error('Fixture source missing')
    return { version: info.version }
  }
  return { root, fs, file, observed }
}

it('moves binary bytes without replacing an existing destination and then removes the file', async () => {
  const h = await harness(), source = await h.file('source.bin', '\0binary\uFFFD')
  const expected = await h.observed(source), destination = await h.fs.resolve('moved.bin')
  const before = await readFile(source.targetKey)
  await h.fs.renameFile(source, destination, expected)
  await expect(readFile(source.targetKey)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(destination.targetKey)).toEqual(before)
  await h.fs.removeFile(destination, await h.observed(destination))
  await expect(readFile(destination.targetKey)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('preserves both files when the destination already exists, including the source itself', async () => {
  const h = await harness(), source = await h.file('source'), destination = await h.file('destination', 'retain')
  const expected = await h.observed(source)
  for (const target of [destination, source]) {
    await expect(h.fs.renameFile(source, target, expected)).rejects.toMatchObject({ code: 'FS_ALREADY_EXISTS' })
  }
  expect(await readFile(source.targetKey, 'utf8')).toBe('source')
  expect(await readFile(destination.targetKey, 'utf8')).toBe('retain')
})

it.each(['remove', 'rename'] as const)('refuses stale sources before %s', async (operation) => {
  const h = await harness(), source = await h.file('source'), expected = await h.observed(source)
  await writeFile(source.targetKey, 'changed after observation')
  const destination = await h.fs.resolve('destination')
  await expect(operation === 'remove' ? h.fs.removeFile(source, expected) : h.fs.renameFile(source, destination, expected))
    .rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
  expect(await readFile(source.targetKey, 'utf8')).toBe('changed after observation')
  await expect(readFile(destination.targetKey)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('serializes opposite moves without deadlocking or replacing either file', async () => {
  const h = await harness(), a = await h.file('a'), b = await h.file('b', 'other')
  const expectedA = await h.observed(a), expectedB = await h.observed(b)
  const result = await Promise.allSettled([
    h.fs.renameFile(a, b, expectedA), h.fs.renameFile(b, a, expectedB),
  ])
  expect(result.map(item => item.status)).toEqual(['rejected', 'rejected'])
  expect(await readFile(a.targetKey, 'utf8')).toBe('source')
  expect(await readFile(b.targetKey, 'utf8')).toBe('other')
})

it('rechecks source freshness and cancellation after asynchronous preparation', async () => {
  const h = await harness(), source = await h.file('source'), expected = await h.observed(source)
  h.fs.internals.beforeFileMutation = () => writeFile(source.targetKey, 'replaced during preparation')
  await expect(h.fs.removeFile(source, expected)).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
  const controller = new AbortController()
  h.fs.internals.beforeFileMutation = () => { controller.abort() }
  await expect(h.fs.renameFile(source, await h.fs.resolve('destination'), await h.observed(source), controller.signal))
    .rejects.toMatchObject({ code: 'FS_ABORTED' })
  expect(await readFile(source.targetKey, 'utf8')).toBe('replaced during preparation')
})

it('reports a published destination if native source removal fails, without deleting either name', async () => {
  const h = await harness(), source = await h.file('source'), destination = await h.fs.resolve('destination')
  h.fs.internals.unlinkFile = () => Promise.reject(Object.assign(new Error('fixture denied'), { code: 'EACCES' }))
  const operation = h.fs.renameFile(source, destination, await h.observed(source))
  await expect(operation).rejects.toMatchObject({ code: 'FS_PARTIAL_MUTATION' })
  await expect(operation).rejects.toThrow('Inspect both paths')
  expect(await readFile(source.targetKey, 'utf8')).toBe('source')
  expect(await readFile(destination.targetKey, 'utf8')).toBe('source')
})

it('finishes an already committed move when cancellation follows publication', async () => {
  const h = await harness(), source = await h.file('source'), destination = await h.fs.resolve('destination')
  const controller = new AbortController()
  h.fs.internals.linkFile = async (from, to) => { await link(from, to); controller.abort() }
  await h.fs.renameFile(source, destination, await h.observed(source), controller.signal)
  await expect(readFile(source.targetKey)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(destination.targetKey, 'utf8')).toBe('source')
})

it('does not delete a replacement source after destination publication', async () => {
  const h = await harness(), source = await h.file('source'), destination = await h.fs.resolve('destination')
  h.fs.internals.linkFile = async (from, to) => { await link(from, to); await unlink(from); await writeFile(from, 'external replacement') }
  await expect(h.fs.renameFile(source, destination, await h.observed(source))).rejects.toMatchObject({ code: 'FS_PARTIAL_MUTATION' })
  expect(await readFile(source.targetKey, 'utf8')).toBe('external replacement')
  expect(await readFile(destination.targetKey, 'utf8')).toBe('source')
})

it('refuses directory sources and missing parents without creating directories', async () => {
  const h = await harness(); await mkdir(join(h.root, 'directory'))
  const directory = await h.fs.resolve('directory')
  await expect(h.fs.removeFile(directory, await h.observed(directory))).rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
  const source = await h.file('source')
  await expect(h.fs.renameFile(source, await h.fs.resolve('missing/destination'), await h.observed(source)))
    .rejects.toMatchObject({ code: 'FS_NOT_FOUND' })
  expect(await readFile(source.targetKey, 'utf8')).toBe('source')
})

it('rejects link entries and a display path that identifies another file', async () => {
  const h = await harness(), source = await h.file('source'), expected = await h.observed(source)
  await symlink(source.targetKey, join(h.root, 'alias'))
  await expect(h.fs.removeFile(await h.fs.resolve('alias'), expected)).rejects.toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
  const mismatched = { displayPath: join(h.root, 'other'), targetKey: FsTargetKey(source.targetKey) }
  await expect(h.fs.removeFile(mismatched, expected)).rejects.toMatchObject({ code: 'FS_STALE_VERSION' })
  expect(await readFile(source.targetKey, 'utf8')).toBe('source')
})
