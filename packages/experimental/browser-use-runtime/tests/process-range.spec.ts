/** Windows process-id reuse cannot create or conceal a browser ownership result. @module */
import { expect, it } from 'vitest'
import { selectProcessRange } from './mcp-upstream.ts'

it('excludes a recycled root id even when that new process has children', () => {
  const root = { pid: 10, parent: 1, created: 'old', name: 'node.exe' }
  expect(selectProcessRange([{ ...root, created: 'new', name: 'powershell.exe' },
    { pid: 11, parent: 10, created: 'new-child', name: 'child.exe' }], [root])).toEqual([])
})
it('detects an observed orphan and its new descendants after the original server exits', () => {
  const root = { pid: 10, parent: 1, created: 'server', name: 'node.exe' }
  const browser = { pid: 11, parent: 10, created: 'browser', name: 'chrome.exe' }
  const child = { pid: 12, parent: 11, created: 'renderer', name: 'chrome.exe' }
  expect(selectProcessRange([browser, child], [root, browser])).toEqual([browser, child])
  expect(selectProcessRange([{ ...browser, created: 'recycled' }], [root, browser])).toEqual([])
})
