/** Native enumeration completion and handle ownership under failure and cancellation. @module */
import { expect, it, vi } from 'vitest'
import type { NativePtr } from '@deepseek-ai/dsh-win32-process'
import { enumerateWindowsLinks, windowsFileLinks, type WindowsLinkBindings } from '../src/windows-file-links.ts'

function fixture(names = ['\\work\\原稿.txt', '\\production\\data.txt']) {
  let index = 0, lastError = 38
  const put = (output: Buffer, value: string) => { output.fill(0); output.write(value, 'utf16le') }
  const api: WindowsLinkBindings = {
    getLastError: () => lastError,
    getVolumePathName: (_path, output) => { put(output, 'D:\\'); return 1 },
    getVolumeName: (_path, output) => { put(output, '\\\\?\\Volume{fixture}\\'); return 1 },
    getVolumePaths: (_name, output) => { put(output, 'D:\\\0E:\\\0\0'); return 1 },
    findFirst: (_path, _flags, _length, output) => { put(output, names[0]!); return 7n as NativePtr },
    findNext: (_handle, _length, output) => {
      index++
      if (index === names.length) return 0
      put(output, names[index]!); return 1
    },
    findClose: vi.fn(() => 1),
  }
  return { api, failNext: (code: number) => { lastError = code; api.findNext = () => 0 } }
}

it('expands every link through every volume mount and closes the enumeration', async () => {
  const { api } = fixture()
  expect(await enumerateWindowsLinks(api, 'D:\\work\\原稿.txt', 2n, new AbortController().signal)).toEqual([
    'D:\\work\\原稿.txt', 'D:\\production\\data.txt', 'E:\\work\\原稿.txt', 'E:\\production\\data.txt',
  ])
  expect(api.findClose).toHaveBeenCalledExactlyOnceWith(7n)
})

it.each([1n, 3n])('refuses changed link counts (%s) and still releases the native handle', async (count) => {
  const { api } = fixture()
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', count, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).toHaveBeenCalledOnce()
})

it('does not treat a failed next call as successful end of enumeration', async () => {
  const { api, failNext } = fixture(); failNext(5)
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).toHaveBeenCalledOnce()
})

it.each(['relative', '\\\\server\\share', '\\..\\escape', '\\work\\原稿.txt'])('refuses ambiguous native name %s', async (name) => {
  const { api } = fixture(['\\work\\原稿.txt', name])
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).toHaveBeenCalledOnce()
})

it('closes the handle when cancellation arrives after the first result', async () => {
  const { api } = fixture(), abort = new AbortController()
  const pending = enumerateWindowsLinks(api, 'D:\\work\\file', 2n, abort.signal)
  abort.abort(new Error('cancelled'))
  await expect(pending).rejects.toBeDefined()
  expect(api.findClose).toHaveBeenCalledOnce()
})

it('refuses output if the native handle could not be closed', async () => {
  const { api } = fixture(); api.findClose = vi.fn(() => 0)
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
})

it('fails before enumeration when volume paths cannot be established', async () => {
  const { api } = fixture(); api.getVolumePaths = () => 0; api.findFirst = vi.fn()
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findFirst).not.toHaveBeenCalled()
  expect(api.findClose).not.toHaveBeenCalled()
})

it.each(['getVolumePathName', 'getVolumeName'] as const)('fails closed when %s fails', async (operation) => {
  const { api } = fixture(); api[operation] = () => 0
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).not.toHaveBeenCalled()
})

it.each(['', '\\\\server\\share\\\0'])('rejects incomplete or nonlocal volume mounts', async (mounts) => {
  const { api } = fixture()
  api.getVolumePaths = (_name, output) => { output.fill(0); output.write(mounts, 'utf16le'); return 1 }
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).not.toHaveBeenCalled()
})

it.each([null, 0n, -1n, 0xffff_ffff_ffff_ffffn])('rejects an invalid first enumeration handle (%s)', async (handle) => {
  const { api } = fixture(); api.findFirst = () => handle as NativePtr | null
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).not.toHaveBeenCalled()
})

it('does not enter native code when already cancelled', async () => {
  const { api } = fixture(); api.getVolumePathName = vi.fn()
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, AbortSignal.abort()))
    .rejects.toBeDefined()
  expect(api.getVolumePathName).not.toHaveBeenCalled()
})

it('refuses an unterminated native string before opening an enumeration', async () => {
  const { api } = fixture()
  api.getVolumePathName = (_path, output) => { output.fill(0x41); return 1 }
  await expect(enumerateWindowsLinks(api, 'D:\\work\\file', 2n, new AbortController().signal))
    .rejects.toMatchObject({ code: 'unavailable' })
  expect(api.findClose).not.toHaveBeenCalled()
})

it('rejects a foreign executor before resolving native bindings', () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')
  if (descriptor === undefined) throw new Error('Platform descriptor is missing')
  try {
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' })
    expect(() => windowsFileLinks('D:\\work\\file', 2n, new AbortController().signal))
      .toThrow('Windows file aliases require a Windows executor')
  } finally { Object.defineProperty(process, 'platform', descriptor) }
})
