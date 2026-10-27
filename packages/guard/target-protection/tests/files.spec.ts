/** Actual local file effects, policy changes and owner-resource denial. @module */
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, link, unlink, stat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { FsTargetKey, type FsTarget } from '@deepseek-ai/dsh-fs'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { afterEach, expect, it, vi } from 'vitest'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import TargetProtection from '../src/index.ts'
import TargetFileSystem from '../src/fs.ts'
import { TargetStore } from '../src/store.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import { canonicalLocalPath, resolveLocalPathIdentity } from '../src/file-identity.ts'

const contexts: Context[] = [], roots: string[] = []
const unblock: (() => void)[] = []
afterEach(async () => {
  for (const release of unblock.splice(0)) release()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function target(path: string): FsTarget { return { targetKey: FsTargetKey(path), displayPath: path } }
function rule(path: string, overrides: Partial<TargetRule> = {}): TargetRule {
  return { id: brandString<TargetRuleId>(randomUUID()), name: 'owned fixture resource', enabled: true, kind: 'database',
    environment: 'production', protection: 'full', match: 'path', address: path, ...overrides }
}
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-files-')); roots.push(root)
  const workspace = join(root, 'workspace'); await mkdir(workspace)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: workspace })
  const store = join(root, 'owner', 'targets.sqlite')
  const policy = await ctx.plugin(TargetProtection, { path: store, hostsFile: '' })
  await ctx.plugin(TargetFileSystem, { cwd: workspace })
  const configure = async (rules: TargetRule[]) => {
    const before = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ mainlandEnabled: false, rules }, before.revision)
  }
  return { ctx, fs: ctx.fs as TargetFileSystem, root, workspace, store, policy, configure }
}

it('full protection rejects direct file calls and leaves existing and prospective files unchanged', async () => {
  const h = await harness(), production = join(h.workspace, 'production')
  await mkdir(production)
  const path = join(production, 'database.txt'); await writeFile(path, 'preserve')
  const stale = await h.fs.resolve(path)
  await h.configure([rule(production)])
  await expect(h.fs.resolve(path)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  for (const operation of [
    () => h.fs.readText(stale), () => h.fs.readBytes(stale, undefined, 100),
    () => h.fs.readByteRange(stale, { offset: 0, length: 3 }), () => h.fs.stat(stale),
    () => h.fs.lstat(path), () => h.fs.streamText(stale), () => h.fs.listDir(target(production)),
    () => h.fs.writeText(stale, 'overwrite'), () => h.fs.editText(stale, { oldString: 'preserve', newString: 'overwrite', replaceAll: false }),
    () => h.fs.writeText(target(join(production, 'missing', 'file.txt')), 'create'),
  ]) await expect(operation()).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(await readFile(path, 'utf8')).toBe('preserve')
  expect(await readdir(production)).toEqual(['database.txt'])
})

it('audit supports structured reads while a test exception cannot override production writes', async () => {
  const h = await harness(), path = join(h.workspace, 'audit.txt')
  await writeFile(path, 'audit evidence')
  const production = rule(path, { protection: 'audit' })
  await h.configure([rule(path, { environment: 'test' }), production])
  const file = await h.fs.resolve(path)
  expect(await h.fs.readText(file)).toBe('audit evidence')
  expect(Buffer.from(await h.fs.readBytes(file, undefined, 100)).toString()).toBe('audit evidence')
  expect(Buffer.from(await h.fs.readByteRange(file, { offset: 0, length: 5 })).toString()).toBe('audit')
  const chunks: string[] = []; for await (const chunk of await h.fs.streamText(file)) chunks.push(chunk)
  expect(chunks.join('')).toBe('audit evidence')
  await expect(h.fs.writeText(file, 'changed', undefined, undefined, { mode: 'danger-full-access', workspaceRoot: h.workspace }))
    .rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
  await expect(h.fs.editText(file, { oldString: 'audit', newString: 'changed', replaceAll: false })).rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
  await h.configure([rule(path, { environment: 'test' })])
  await h.fs.writeText(file, 'test target')
  expect(await readFile(path, 'utf8')).toBe('test target')
})

it('preserves the physical filename spelling used by the local executor', async () => {
  const h = await harness(), path = join(h.workspace, 'MixedCase.txt')
  await writeFile(path, 'original'); await h.configure([])
  const file = await h.fs.resolve(path)
  expect(String(file.targetKey)).toMatch(/[\\/]MixedCase\.txt$/u)
  await h.fs.writeText(file, 'same file')
  expect(await readFile(path, 'utf8')).toBe('same file')
})

it('retains native file identity precision instead of rounding large Windows file IDs', async () => {
  const h = await harness()
  for (let index = 0; index < 16; index++) {
    const path = join(h.workspace, `identity-${String(index)}.txt`)
    await writeFile(path, 'owned')
    const native = await stat(path, { bigint: true })
    const identity = await resolveLocalPathIdentity(path, new AbortController().signal)
    expect(identity.fileId).toBe(`${String(native.dev)}:${String(native.ino)}`)
  }
})

it('shares one database policy across its network identity, data file and SQLite companions', async () => {
  const h = await harness(), path = join(h.workspace, 'production.sqlite')
  const database = new DatabaseSync(path)
  try {
    database.exec("PRAGMA journal_mode=WAL; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES('preserve')")
    const files = [path, `${path}-wal`, `${path}-shm`]
    const before = await Promise.all(files.map(file => readFile(file)))
    const resource = rule('192.0.2.10', { match: 'host', port: 5432, database: 'production',
      aliases: [{ match: 'path', address: path }] })
    await h.configure([resource])
    for (const file of [...files, `${path}-journal`]) {
      await expect(h.fs.writeText(target(file), 'corrupt')).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
      await expect(h.fs.readBytes(target(file), undefined, 100000)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    }
    expect(await Promise.all(files.map(file => readFile(file)))).toEqual(before)
    expect(database.prepare('SELECT value FROM evidence').get()).toEqual({ value: 'preserve' })
    const decision = await h.ctx.targetProtection.checkLocalFile(path, 'read', new AbortController().signal)
    expect(decision.decision).toMatchObject({ allowed: false, ruleIds: [resource.id] })
    await h.configure([{ ...resource, protection: 'audit' }])
    expect((await h.fs.readBytes(await h.fs.resolve(path), undefined, 100000)).byteLength).toBeGreaterThan(0)
    await expect(h.fs.writeText(target(`${path}-wal`), 'corrupt')).rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
  } finally { database.close() }
})

it('keeps a separate test database writable while protecting another resource in the same directory', async () => {
  const h = await harness(), production = join(h.workspace, 'prod.sqlite'), testing = join(h.workspace, 'test.sqlite')
  await writeFile(production, 'production'); await writeFile(testing, 'test')
  await h.configure([rule(production), rule(testing, { environment: 'test' })])
  await h.fs.writeText(await h.fs.resolve(testing), 'changed test')
  await h.fs.writeText(await h.fs.resolve(`${testing}-wal`), 'test companion')
  expect(await readFile(testing, 'utf8')).toBe('changed test')
  expect(await readFile(`${testing}-wal`, 'utf8')).toBe('test companion')
  expect(await readFile(production, 'utf8')).toBe('production')
})

it('resolves directory links, changed ancestors and direct hard links before access', async () => {
  const h = await harness(), production = join(h.workspace, 'prod'), safe = join(h.workspace, 'test')
  await mkdir(production); await mkdir(safe)
  const path = join(production, 'data.txt'); await writeFile(path, 'production')
  await writeFile(join(safe, 'data.txt'), 'test')
  const alias = join(h.workspace, 'alias')
  await symlink(safe, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const old = await h.fs.resolve(join(alias, 'data.txt'))
  await h.configure([rule(production)])
  await unlink(alias); await symlink(production, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(h.fs.readText(old)).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  await expect(h.fs.resolve(join(alias, 'missing', 'new.txt'))).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  const hard = join(h.workspace, 'hard.txt'); await link(path, hard)
  await h.configure([rule(path)])
  await expect(h.fs.readText(target(hard))).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  await h.configure([rule(production)])
  await expect(h.fs.readText(target(hard))).rejects.toMatchObject({ code: 'TARGET_IDENTITY_UNVERIFIED' })
  expect(await readFile(path, 'utf8')).toBe('production')
})

it('protects the registry and its sidecars even when ordinary target rules are disabled', async () => {
  const h = await harness(); await h.configure([])
  const before = await readFile(h.store)
  for (const path of [h.store, `${h.store}-wal`, `${h.store}-journal`]) {
    await expect(h.fs.writeText(target(path), 'corrupt')).rejects.toMatchObject({ code: 'TARGET_OWNER_RESOURCE' })
  }
  await expect(h.fs.readBytes(target(h.store), undefined, 100000)).rejects.toMatchObject({ code: 'TARGET_OWNER_RESOURCE' })
  const alias = join(h.workspace, 'rule-copy.sqlite'); await link(h.store, alias)
  await expect(h.fs.writeText(target(alias), 'corrupt')).rejects.toMatchObject({ code: 'TARGET_OWNER_RESOURCE' })
  expect(await readFile(h.store)).toEqual(before)
  expect((await h.ctx.targetProtection.snapshot()).preferences.rules).toEqual([])
})

it('rechecks another connection’s rules at atomic publication and removes staging residue', async () => {
  const h = await harness(), path = join(h.workspace, 'current.txt')
  await writeFile(path, 'before'); await h.configure([])
  const other = await TargetStore.open(h.store, 1000)
  try {
    h.fs.internals.inspectTemp = () => {
      const current = other.snapshot()
      other.configure({ mainlandEnabled: false, rules: [rule(path)] }, current.revision)
    }
    await expect(h.fs.writeText(target(path), 'after')).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    expect(await readFile(path, 'utf8')).toBe('before')
    expect(await readdir(h.workspace)).toEqual(['current.txt'])
  } finally { other.close() }
})

it('revokes an unopened stream and old provider references when policy or lifetime changes', async () => {
  const h = await harness(), path = join(h.workspace, 'stream.txt')
  await writeFile(path, 'retain'); await h.configure([])
  const stream = await h.fs.streamText(target(path))
  await h.configure([rule(path)])
  await expect((async () => { for await (const chunk of stream) void chunk })()).rejects.toBeDefined()
  const old = h.fs
  await h.policy.dispose()
  await expect(old.readText(target(path))).rejects.toBeDefined()
})

it('rejects remote paths and network qualifiers on local database rules', async () => {
  const h = await harness()
  await expect(h.configure([rule(join(h.workspace, 'data'), { port: 5432 })])).rejects.toMatchObject({ code: 'invalid' })
  expect(() => canonicalLocalPath('relative.txt')).toThrow()
  if (process.platform === 'win32') {
    for (const path of ['\\\\server\\share\\data', 'C:\\test.txt:stream', 'C:\\ambiguous.\\data', '/var/lib/database', '\\database']) {
      expect(() => canonicalLocalPath(path)).toThrow()
    }
  }
})

it('waits for a paused source iterator to close before withdrawing the file service', async () => {
  const h = await harness(), path = join(h.workspace, 'held.txt')
  await writeFile(path, 'held'); await h.configure([])
  const closing = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  unblock.push(() => { release.resolve(true) })
  let returned = 0, disposed = false
  vi.spyOn(LocalFileSystem.prototype, 'streamText').mockResolvedValue({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: false, value: 'chunk' }),
      return: async () => {
        returned++; closing.resolve(true)
        await release.promise
        return { done: true, value: undefined }
      },
    }),
  })
  const iterator = (await h.fs.streamText(target(path)))[Symbol.asyncIterator]()
  expect(await iterator.next()).toEqual({ done: false, value: 'chunk' })
  const disposal = h.policy.dispose().then(() => { disposed = true })
  try {
    await closing.promise
    expect(disposed).toBe(false)
    expect(returned).toBe(1)
  } finally { release.resolve(true) }
  await disposal
  await expect(iterator.next()).rejects.toBeDefined()
  expect(returned).toBe(1)
})

it('waits for a staged native write to stop and removes its temporary files during withdrawal', async () => {
  const h = await harness(), path = join(h.workspace, 'pending.txt')
  await writeFile(path, 'before'); await h.configure([])
  const staged = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  const streamClosed = Promise.withResolvers<boolean>()
  let cleaned = false
  const storageClose: boolean[] = []
  // oxlint-disable-next-line typescript/unbound-method -- The spy forwards with its original TargetStore receiver.
  const originalClose = TargetStore.prototype.close
  vi.spyOn(TargetStore.prototype, 'close').mockImplementation(function (this: TargetStore) {
    storageClose.push(cleaned)
    originalClose.call(this)
  })
  unblock.push(() => { release.resolve(true) })
  vi.spyOn(LocalFileSystem.prototype, 'streamText').mockResolvedValue({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ done: true, value: undefined }),
      return: () => { streamClosed.resolve(true); return Promise.resolve({ done: true, value: undefined }) },
    }),
  })
  await h.fs.streamText(target(path))
  h.fs.internals.inspectTemp = async () => { staged.resolve(true); await release.promise }
  h.fs.internals.removeStagingDir = async (directory) => { await rm(directory, { recursive: true, force: true }); cleaned = true }
  const operation = h.fs.writeText(target(path), 'after')
  const failed = expect(operation).rejects.toBeDefined()
  await staged.promise
  const disposal = h.policy.dispose()
  await streamClosed.promise
  release.resolve(true)
  await failed
  await disposal
  expect(storageClose).toEqual([true])
  expect(await readFile(path, 'utf8')).toBe('before')
  expect(await readdir(h.workspace)).toEqual(['pending.txt'])
})
