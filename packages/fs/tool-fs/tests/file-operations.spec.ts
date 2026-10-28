/** Real Loader composition and replayable output for optional regular-file tools. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { FileSystem } from '@deepseek-ai/dsh-fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import * as ToolFs from '../src/index.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-file-tools-')); roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  const config = join(root, 'cordis.yml')
  await copyFile(fileURLToPath(new URL('./fixtures/file-operations.yml', import.meta.url)), config)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, {
    include: Include, tools: ToolRuntime, 'system-prompt': SystemPrompt, 'fs-local': LocalFileSystem,
    'working-directory-fixture': { apply: provideWorkingDirectoryFixture }, 'tool-fs': ToolFs,
  })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  let index = 0
  const call = (name: string, args: object) => ctx.tools.execute({
    name, arguments: args, callId: ToolCallId(`file-op-${String(++index)}`), signal: new AbortController().signal,
  })
  return { root, ctx, call }
}

it('runs optional tools from YAML and records actual source/destination effects with compact output', async () => {
  const h = await harness(), source = join(h.root, 'source.txt'), destination = join(h.root, 'destination.txt')
  await writeFile(source, 'owned fixture')
  const moved = await h.call('rename_file', { source_path: source, destination_path: destination })
  expect(moved.isError).toBe(false)
  expect(moved.meta).toMatchObject({ operation: 'rename', source, destination })
  expect(moved.content).toEqual([{ type: 'text', text: `Renamed file: ${source} -> ${destination}` }])
  expect(await readFile(destination, 'utf8')).toBe('owned fixture')
  await expect(readFile(source)).rejects.toMatchObject({ code: 'ENOENT' })
  const removed = await h.call('remove_file', { file_path: destination })
  expect(removed.isError).toBe(false)
  expect(removed.meta).toMatchObject({ operation: 'remove', path: destination })
  expect(removed.content).toEqual([{ type: 'text', text: `Removed file: ${destination}` }])
  await expect(readFile(destination)).rejects.toMatchObject({ code: 'ENOENT' })
  const entry = [...h.ctx.loader.entries()].find(entry => entry.options.id === 'file-tools')
  if (entry?.fiber === undefined) throw new Error('Fixture tool entry missing')
  await entry.fiber.dispose()
  expect(h.ctx.tools.get('remove_file')).toBeUndefined()
  expect(h.ctx.tools.get('rename_file')).toBeUndefined()
})

it('returns structured errors while keeping an occupied destination unchanged', async () => {
  const h = await harness(), source = join(h.root, 'source'), destination = join(h.root, 'destination')
  await writeFile(source, 'source'); await writeFile(destination, 'existing')
  const result = await h.call('rename_file', { source_path: source, destination_path: destination })
  expect(result).toMatchObject({ isError: true, error: { info: { code: 'FS_ALREADY_EXISTS' } } })
  expect(await readFile(source, 'utf8')).toBe('source')
  expect(await readFile(destination, 'utf8')).toBe('existing')
  expect((await h.call('remove_file', { file_path: ' ' })).isError).toBe(true)
})

it('leaves the new operations disabled by default', async () => {
  const ctx = new Context(); contexts.push(ctx)
  provideWorkingDirectoryFixture(ctx)
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(LocalFileSystem)
  await ctx.plugin(ToolFs)
  expect(ctx.tools.get('remove_file')).toBeUndefined()
  expect(ctx.tools.get('rename_file')).toBeUndefined()
})

it('rejects operations on providers that have not implemented them', async () => {
  const h = await harness(), source = await h.ctx.fs.resolve(join(h.root, 'source'))
  await writeFile(source.displayPath, 'source')
  const version = (await h.ctx.fs.stat(source))!.version
  await expect(FileSystem.prototype.removeFile.call(h.ctx.fs, source, { version })).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  await expect(FileSystem.prototype.renameFile.call(h.ctx.fs, source, source, { version })).rejects.toMatchObject({ code: 'FS_IO_ERROR' })
  expect(await readFile(source.displayPath, 'utf8')).toBe('source')
})
