import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { forkUpdateSource, readInstalledUpdateSource } from '../src/update-source.ts'

it('accepts this fork and its packaged GitHub artifact feed', () => {
  expect(forkUpdateSource({ provider: 'github', owner: 'Water-Run', repo: 'deepseek-harness-uncensored' })).toMatchObject({ provider: 'github' })
  const url = 'https://github.com/Water-Run/deepseek-harness-uncensored/releases/latest/download/'
  expect(forkUpdateSource({ provider: 'generic', url })).toEqual({ provider: 'generic', url, useMultipleRangeRequest: false })
})

it('uses single ranges for a pinned GitHub release even if its configuration requests multipart', () => {
  const url = 'https://github.com/Water-Run/deepseek-harness-uncensored/releases/download/v1.0.0/'
  expect(forkUpdateSource({ provider: 'generic', url, useMultipleRangeRequest: true }))
    .toEqual({ provider: 'generic', url, useMultipleRangeRequest: false })
})

it.each([
  'https://download.deepseek.com/feed/', 'https://myqcloud.com/feed/', 'https://bucket.cos.ap-beijing.myqcloud.com/feed/',
  'https://github.com/deepseek-ai/deepseek-harness/releases/latest/download/',
  'http://github.com/Water-Run/deepseek-harness-uncensored/releases/latest/download/',
  'https://github.com/Water-Run/deepseek-harness-uncensored-other/releases/latest/download/',
  'https://user:pass@github.com/Water-Run/deepseek-harness-uncensored/releases/latest/download/',
])('refuses untrusted update source %s before provider creation', (url) => {
  expect(() => forkUpdateSource({ provider: 'generic', url })).toThrow()
})

it('rejects an overridden GitHub host and unknown provider', () => {
  expect(() => forkUpdateSource({ provider: 'github', owner: 'Water-Run', repo: 'deepseek-harness-uncensored', host: 'elsewhere.invalid' })).toThrow()
  expect(() => forkUpdateSource({ provider: 's3' })).toThrow()
})

it('accepts a publisher-free unsigned install and requires a complete publisher when one is declared', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-update-source-'))
  const path = join(directory, 'app-update.yml')
  const source = { provider: 'github', owner: 'Water-Run', repo: 'deepseek-harness-uncensored' }
  const publisher = String.raw`CN=Fixture\20Publisher,O=Fixture\2c\20Inc.,C=CN`
  await writeFile(path, JSON.stringify(source))
  try {
    await expect(readInstalledUpdateSource(directory, 'linux')).resolves.toEqual(source)
    // An unsigned Windows build declares no publisher; electron-updater then skips signature checks.
    await expect(readInstalledUpdateSource(directory, 'win32')).resolves.toEqual(source)
    for (const publisherName of [null, [], [''], 'CN=Fixture', [publisher, publisher], `${publisher},O=Other`]) {
      await writeFile(path, JSON.stringify({ ...source, publisherName }))
      await expect(readInstalledUpdateSource(directory, 'win32')).rejects.toThrow(/installed Windows publisher/u)
    }
    const signed = { ...source, publisherName: [publisher] }
    await writeFile(path, JSON.stringify(signed))
    await expect(readInstalledUpdateSource(directory, 'win32')).resolves.toEqual(signed)
  } finally {
    await unlink(path)
    await rmdir(directory)
  }
})
