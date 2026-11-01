/** Native policies retain production precedence across grants, aliases and future files. @module */
import { mkdtemp, mkdir, writeFile, link, symlink, rm, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { compileNativeFilePolicy } from '../src/native-file-policy.ts'
import * as identities from '../src/file-identity.ts'

afterEach(() => { vi.restoreAllMocks() })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-file-policy-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const workspace = join(root, 'work'), production = join(root, 'production'), audit = join(root, 'audit')
  for (const directory of [workspace, production, audit, join(audit, 'nested')]) await mkdir(directory)
  await writeFile(join(production, 'data.txt'), 'production')
  await writeFile(join(audit, 'data.txt'), 'audit')
  return { root, workspace, production, audit, grants: { readonlyPaths: [root],
    readwritePaths: [workspace, join(audit, 'nested')], maxEntries: 100, maxPaths: 100 } }
}

it('keeps readonly production overrides even when a broader readable root and a nested writable grant exist', async () => {
  const h = await fixture()
  const result = await compileNativeFilePolicy({ revision: 12, entries: [
    { path: h.production, access: 'deny' }, { path: h.audit, access: 'read-only' },
    { path: join(h.root, 'future.sqlite'), access: 'deny', database: true },
  ] }, h.grants, new AbortController().signal)
  expect(result.revision).toBe(12)
  expect(result.readwritePaths).toEqual([h.workspace])
  expect(result.readonlyPaths).toEqual(expect.arrayContaining([h.audit, h.root]))
  expect(result.enumeratePaths).not.toContain(h.workspace)
  expect(result.enumeratePaths).not.toContain(h.root)
  expect(result.deniedPaths).toEqual(expect.arrayContaining([h.production, join(h.root, 'future.sqlite'),
    join(h.root, 'future.sqlite-wal'), join(h.root, 'future.sqlite-shm'), join(h.root, 'future.sqlite-journal')]))
})

it.runIf(process.platform === 'win32')('protects every hard-link name outside a protected directory', async () => {
  const h = await fixture(), fullAlias = join(h.workspace, 'full-link.txt'), auditAlias = join(h.workspace, 'audit-link.txt')
  await link(join(h.production, 'data.txt'), fullAlias); await link(join(h.audit, 'data.txt'), auditAlias)
  const result = await compileNativeFilePolicy({ revision: 1, entries: [
    { path: h.production, access: 'deny' }, { path: h.audit, access: 'read-only' },
  ] }, h.grants, new AbortController().signal)
  expect(result.deniedPaths).toContain(fullAlias)
  expect(result.readonlyPaths).toContain(auditAlias)
  expect(result.readwritePaths).toEqual([h.workspace])
})

it('terminates directory link cycles without dropping the linked target restriction', async () => {
  const h = await fixture()
  await symlink(h.production, join(h.production, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir')
  const result = await compileNativeFilePolicy({ revision: 1, entries: [{ path: h.production, access: 'deny' }] },
    h.grants, new AbortController().signal)
  expect(result.deniedPaths).toEqual([h.production])
})

it('rejects an incomplete scan and closes directory iterators on failure', async () => {
  const h = await fixture()
  await expect(compileNativeFilePolicy({ revision: 1, entries: [{ path: h.production, access: 'deny' }] },
    { ...h.grants, maxEntries: 1 }, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
  await rm(h.production, { recursive: true })
})

it('rejects absent writable roots and cancellation before filesystem inspection', async () => {
  const h = await fixture()
  await expect(compileNativeFilePolicy({ revision: 1, entries: [] },
    { ...h.grants, readwritePaths: [join(h.root, 'missing')] }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'invalid' })
  await expect(compileNativeFilePolicy({ revision: 1, entries: [] }, h.grants, AbortSignal.abort())).rejects.toBeDefined()
})

it('keeps complete protection stronger than overlapping readonly and writable grants', async () => {
  const h = await fixture()
  const result = await compileNativeFilePolicy({ revision: 1, entries: [
    { path: h.production, access: 'deny' }, { path: h.production, access: 'read-only' },
  ] }, { ...h.grants, readonlyPaths: [h.production], readwritePaths: [h.production] }, new AbortController().signal)
  expect(result.deniedPaths).toEqual([h.production])
  expect(result.readonlyPaths).toEqual([])
  expect(result.readwritePaths).toEqual([])
})

it('refuses entry-set and complete-policy path budgets instead of truncating restrictions', async () => {
  const h = await fixture()
  await expect(compileNativeFilePolicy({ revision: 1, entries: [
    { path: h.production, access: 'deny' }, { path: h.audit, access: 'deny' },
  ] }, { ...h.grants, maxPaths: 1 }, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
  await expect(compileNativeFilePolicy({ revision: 1, entries: [] },
    { ...h.grants, maxPaths: 2 }, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
})

it('refuses missing readonly grants and incomplete native identities', async () => {
  const h = await fixture(), signal = new AbortController().signal
  await expect(compileNativeFilePolicy({ revision: 1, entries: [] },
    { ...h.grants, readonlyPaths: [join(h.root, 'missing')] }, signal)).rejects.toMatchObject({ code: 'invalid' })
  const resolve = identities.resolveLocalPathIdentity
  vi.spyOn(identities, 'resolveLocalPathIdentity').mockImplementation(async (path, signal) => {
    const result = await resolve(path, signal)
    const { fileId: _fileId, ...withoutId } = result
    return withoutId
  })
  await expect(compileNativeFilePolicy({ revision: 1, entries: [{ path: h.production, access: 'deny' }] }, h.grants, signal))
    .rejects.toMatchObject({ code: 'unavailable' })
})

it('refuses unenumerated hard-link aliases on a native metadata provider', async () => {
  const h = await fixture(), resolve = identities.resolveLocalPathIdentity
  const file = join(h.production, 'data.txt')
  await link(file, join(h.workspace, 'linked.txt'))
  vi.spyOn(identities, 'resolveLocalPathIdentity').mockImplementation(async (path, signal) => {
    const { aliases: _aliases, ...result } = await resolve(path, signal)
    return result
  })
  await expect(compileNativeFilePolicy({ revision: 1, entries: [{ path: file, access: 'deny' }] },
    h.grants, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
})

it('compacts child constraints when their whole parent is protected', async () => {
  const h = await fixture()
  const result = await compileNativeFilePolicy({ revision: 1, entries: [
    { path: join(h.production, 'data.txt'), access: 'deny' }, { path: h.production, access: 'deny' },
  ] }, h.grants, new AbortController().signal)
  expect(result.deniedPaths).toEqual([h.production])
})

it('refuses a directory whose metadata changes while its children are inspected', async () => {
  const h = await fixture(), resolve = identities.resolveLocalPathIdentity
  vi.spyOn(identities, 'resolveLocalPathIdentity').mockImplementation(async (path, signal) => {
    const result = await resolve(path, signal)
    if (path === join(h.production, 'data.txt')) await utimes(h.production, new Date(0), new Date(0))
    return result
  })
  await expect(compileNativeFilePolicy({ revision: 1, entries: [{ path: h.production, access: 'deny' }] },
    h.grants, new AbortController().signal)).rejects.toMatchObject({ code: 'unavailable' })
})
