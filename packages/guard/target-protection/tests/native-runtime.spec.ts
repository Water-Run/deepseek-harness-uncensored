/** Unsupported runtimes fail before allocating the native broker. @module */
import { expect, it } from 'vitest'
import { requireNativeRuntime } from '../src/native-runtime.ts'

it.each([
  ['linux', '24.0.0', false], ['darwin', '24.0.0', false], ['win32', '22.19.0', false],
  ['win32', 'unknown', false], ['win32', '24.0.0', true],
] as const)('rejects %s %s packaged=%s', (platform, version, packaged) => {
  expect(() => { requireNativeRuntime(platform, version, packaged) }).toThrow('requires an unpacked Windows Node 24 runtime')
})

it('admits the supported runtime without modifying host state', () => {
  expect(() => { requireNativeRuntime('win32', '24.21.0', false) }).not.toThrow()
})
