/** Native-build publication rejects failures and never retains the preferred stale addon. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ExecFileOptions } from 'node:child_process'
import { prepareWindowsPty } from '../scripts/prepare-windows-pty.ts'

const { compile } = vi.hoisted(() => ({
  compile: vi.fn<(file: string, args: readonly string[], options: ExecFileOptions) => Promise<{ stdout: string; stderr: string }>>(),
}))
vi.mock('node:child_process', async (importOriginal) => {
  const { promisify } = await import('node:util')
  return { ...await importOriginal<typeof import('node:child_process')>(),
    execFile: Object.assign(vi.fn(), { [promisify.custom]: compile }) }
})
const roots: string[] = []
afterEach(() => {
  vi.resetAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dshu-pty-build-test-'))
  roots.push(root)
  mkdirSync(join(root, 'prebuilds/win32-x64'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.0-beta.15' }))
  writeFileSync(join(root, 'prebuilds/win32-x64/conpty.node'), 'old')
  return root
}
it('publishes only the compiled loader and removes build-directory precedence', async () => {
  const root = fixture()
  compile.mockImplementation(async () => {
    mkdirSync(join(root, 'build/Release'), { recursive: true })
    writeFileSync(join(root, 'build/Release/conpty.node'), 'long-path-loader')
    return { stdout: '', stderr: '' }
  })
  await prepareWindowsPty(root, 'electron', 'node-bin', '24.22.1', 'x64')
  expect(readFileSync(join(root, 'prebuilds/win32-x64/conpty.node'), 'utf8')).toBe('long-path-loader')
  expect(existsSync(join(root, 'build'))).toBe(false)
  expect(compile).toHaveBeenCalledWith('electron', expect.arrayContaining([
    `--directory=${root}`, '--target=24.22.1', '--arch=x64',
  ]), expect.objectContaining({ windowsHide: true }))
  expect(compile.mock.calls[0]![1].some(arg => arg.startsWith('--dist-url='))).toBe(true)
  expect(compile.mock.calls[0]![2].env?.ELECTRON_RUN_AS_NODE).toBe('1')
})
it('aborts packaging on compiler failure instead of retaining an apparently successful prebuild', async () => {
  const root = fixture()
  const error = new Error('MSVC is unavailable')
  compile.mockRejectedValueOnce(error)
  await expect(prepareWindowsPty(root, 'electron', 'node-bin', '24.22.1', 'x64')).rejects.toBe(error)
  expect(readFileSync(join(root, 'prebuilds/win32-x64/conpty.node'), 'utf8')).toBe('old')
})
it('requires review when the native dependency version changes', async () => {
  const root = fixture()
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.3.0' }))
  await expect(prepareWindowsPty(root, 'electron', 'node-bin', '24.22.1', 'x64')).rejects.toThrow('review the native patch')
  expect(compile).not.toHaveBeenCalled()
})
