import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { stagehandExtensionEnvironment } from '../src/browser-extension.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'desktop-browser-extension-'))
  roots.push(root)
  const runtime = join(root, 'app.asar', 'dsh')
  const directory = join(root, 'app.asar.unpacked', 'dsh', 'node_modules', '@browserbasehq', 'stagehand', 'dist', 'extension')
  mkdirSync(directory, { recursive: true })
  return { root, runtime, directory, manifest: join(directory, 'manifest.json') }
}

it('uses the physical extension directory for an archived Desktop runtime', () => {
  const f = fixture()
  writeFileSync(f.manifest, '{}')
  expect(stagehandExtensionEnvironment(f.runtime)).toEqual({ STAGEHAND_EXTENSION_DIRECTORY_PATH: f.directory })
})

it('rejects a missing physical manifest instead of returning an ASAR path', () => {
  const f = fixture()
  expect(() => stagehandExtensionEnvironment(f.runtime)).toThrow()
})

it('rejects a directory in place of the extension manifest', () => {
  const f = fixture()
  mkdirSync(f.manifest)
  expect(() => stagehandExtensionEnvironment(f.runtime)).toThrow('manifest is not a file')
})

it('keeps prepared runtimes on ordinary SDK resource discovery', () => {
  const f = fixture()
  expect(stagehandExtensionEnvironment(join(f.root, 'dsh'))).toEqual({})
})
