import { expect, it } from 'vitest'
import { readmeErrors } from './verify-readme.ts'

it('rejects empty, oversized, and broken local documentation', () => {
  expect(readmeErrors('', import.meta.dirname)).not.toEqual([])
  expect(readmeErrors('line\n'.repeat(121), import.meta.dirname)).not.toEqual([])
  expect(readmeErrors('[旧网站](removed-website/index.md)', import.meta.dirname)).toEqual([
    'README.md: missing link target removed-website/index.md',
  ])
})

it('accepts existing local files, HTTPS destinations and section anchors', () => {
  expect(readmeErrors('[源码](verify-readme.ts#entry) [反馈](https://github.com) [功能](#功能)', import.meta.dirname)).toEqual([])
})
