import { expect, it } from 'vitest'
import { forkUpdateSource } from '../src/update-source.ts'

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
