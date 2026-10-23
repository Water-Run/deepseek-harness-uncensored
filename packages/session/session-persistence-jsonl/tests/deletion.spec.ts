import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import { SessionAlreadyOwnedError, SessionHandleClosedError } from '@deepseek-ai/dsh-session-persistence'
import * as Jsonl from '../src/index.ts'
import { sessionDir } from '../src/format.ts'
import { DELETION_DIRECTORIES } from '../src/deletion.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function rootDirectory() { const root = await mkdtemp(join(tmpdir(), 'dshu-session-delete-')); roots.push(root); return root }
async function backend(root: string) {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Jsonl, { root, compression: 'none' }).await()
  return ctx
}
async function stored(ctx: Context, root: string, name: string) {
  const id = SessionId(name)
  const cwd = join(root, 'workspace')
  await mkdir(cwd, { recursive: true })
  await writeFile(join(cwd, 'keep.txt'), 'workspace data')
  const writer = await ctx.sessionPersistence.create({ id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, cwd })
  await writer.flush()
  return { id, cwd, writer, directory: sessionDir(root, cwd, id) }
}

it('requires writer release and permanently removes all Session-owned files while retaining workspace files', async () => {
  const root = await rootDirectory(), ctx = await backend(root)
  const session = await stored(ctx, root, 'delete-me')
  await expect(ctx.sessionPersistence.deleteSessions([session.id])).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
  expect(await ctx.sessionPersistence.stat(session.id)).toBeDefined()
  await session.writer.close()
  const reader = await ctx.sessionPersistence.open(session.id, 'read')
  await writeFile(join(session.directory, 'attachment.txt'), 'session-owned attachment')
  const removed = vi.fn()
  ctx.on('session-persistence/deleted', removed)
  expect(await ctx.sessionPersistence.deleteSessions([session.id])).toEqual([session.id])
  expect(removed).toHaveBeenCalledWith(session.id)
  await expect(reader.read()).rejects.toBeInstanceOf(SessionHandleClosedError)
  expect(await ctx.sessionPersistence.stat(session.id)).toBeUndefined()
  expect(await ctx.sessionPersistence.list()).toEqual([])
  expect(await readFile(join(session.cwd, 'keep.txt'), 'utf8')).toBe('workspace data')
  await expect(readdir(session.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await ctx.sessionPersistence.deleteSessions([session.id])).toEqual([])
  await ctx.fiber.dispose()
  const reopened = await backend(root)
  expect(await reopened.sessionPersistence.list()).toEqual([])
  expect(await reopened.sessionPersistence.deletedSessionIds()).toEqual([session.id])
  await expect(reopened.sessionPersistence.create({ id: session.id, version: SESSION_FORMAT_VERSION, createdAt: 2, isSeeded: false }))
    .rejects.toThrow()
})

it('refuses a writer held by another backend and then allows deletion after release', async () => {
  const root = await rootDirectory(), owner = await backend(root), other = await backend(root)
  const session = await stored(owner, root, 'owned')
  await expect(other.sessionPersistence.deleteSessions([session.id])).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
  await session.writer.close()
  expect(await other.sessionPersistence.deleteSessions([session.id])).toEqual([session.id])
  expect(await owner.sessionPersistence.stat(session.id)).toBeUndefined()
})

it('checks every writer before removing any member of a deletion batch', async () => {
  const root = await rootDirectory(), owner = await backend(root), other = await backend(root)
  const free = await stored(owner, root, 'first-free'), busy = await stored(owner, root, 'second-busy')
  await free.writer.close()
  await expect(other.sessionPersistence.deleteSessions([free.id, busy.id])).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
  expect(await other.sessionPersistence.stat(free.id)).toBeDefined()
  const reclaimed = await other.sessionPersistence.open(free.id, 'write')
  await reclaimed.close()
  await busy.writer.close()
  expect(await other.sessionPersistence.deleteSessions([free.id, busy.id])).toEqual([free.id, busy.id])
})

it('finishes committed retired-file cleanup on restart without deleting a live Session carrying an old intent', async () => {
  const root = await rootDirectory(), ctx = await backend(root)
  const retired = await stored(ctx, root, 'retired'), live = await stored(ctx, root, 'still-live')
  await retired.writer.close(); await live.writer.close()
  for (const session of [retired, live]) await writeFile(join(session.directory, '.dshu-delete.json'), JSON.stringify({ version: 1, id: session.id }))
  const pending = join(root, DELETION_DIRECTORIES[0])
  await mkdir(pending)
  await rename(retired.directory, join(pending, createHash('sha256').update(retired.id).digest('hex')))
  await ctx.fiber.dispose()
  const reopened = await backend(root)
  expect(await readdir(pending)).toEqual([])
  expect((await reopened.sessionPersistence.list()).map(row => row.header.id)).toEqual([live.id])
  expect(await reopened.sessionPersistence.deletedSessionIds()).toEqual([retired.id])
  expect(await readFile(join(live.cwd, 'keep.txt'), 'utf8')).toBe('workspace data')
})

it('rejects unrecognized retired data instead of recursively deleting it', async () => {
  const root = await rootDirectory()
  const pending = join(root, DELETION_DIRECTORIES[0], 'a'.repeat(64))
  await mkdir(pending, { recursive: true })
  await writeFile(join(pending, 'keep.txt'), 'unrecognized data')
  await expect(backend(root)).rejects.toThrow()
  expect(await readFile(join(pending, 'keep.txt'), 'utf8')).toBe('unrecognized data')
})
