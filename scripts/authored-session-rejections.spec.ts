/** Negative source admission and valid V3 envelopes for immutable authored protection fixtures. */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { parseSessionLog } from '@deepseek-ai/dsh-llm-replay'
import { authoredSessionRejections, verifyAuthoredSessionRejection } from './authored-session-rejections.ts'
import { canonicalSessionFixture } from './session-fixture-layout.ts'

const root = resolve(import.meta.dirname, '..')
const fixtures = Object.entries(authoredSessionRejections)

function object(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an authored object')
  return value as Record<string, unknown>
}

it.each(fixtures)('%s retains its exact source and rejects its malformed tool result', (path) => {
  const bytes = readFileSync(resolve(root, path))
  const source = bytes.toString('utf8')
  expect(verifyAuthoredSessionRejection(path, source, 'layout', () => canonicalSessionFixture(source, path))).toBe(true)
  expect(verifyAuthoredSessionRejection(path, source, 'restore', () => parseSessionLog(source))).toBe(true)
  expect(readFileSync(resolve(root, path))).toEqual(bytes)
})

it.each(fixtures)('%s accepts the same tool output with a valid V3 wrapper', (path) => {
  const bytes = readFileSync(resolve(root, path))
  const rows = bytes.toString('utf8').trim().split(/\r?\n/u).map(line => object(JSON.parse(line)))
  const expected = rows.filter(row => row['type'] === 'tool/result').map((row) => {
    const data = object(row['data']), message = object(data['message'])
    return { content: message['content'], callId: object(message['source'])['callId'], isError: data['error'] !== undefined }
  })
  // Only the in-memory candidate changes. Committed predecessor files remain frozen.
  for (const row of rows) {
    if (row['type'] !== 'tool/result') continue
    const data = object(row['data']), message = object(data['message']), source = object(message['source'])
    message['content'] = [{ type: 'tool-result', toolCallId: source['callId']!, content: message['content']!,
      ...(data['error'] === undefined ? {} : { isError: true }) }]
    delete message['isError']
  }
  const candidate = rows.map(row => JSON.stringify(row)).join('\n') + '\n'
  const current = readFileSync(resolve(root, dirname(path), 'session.v4.jsonl'), 'utf8')
  const results = parseSessionLog(candidate).filter(event => event.type === 'tool/result')
  expect(results.map(event => ({ content: event.data.message.content, callId: event.data.message.toolCallId,
    isError: event.data.message.isError ?? false }))).toEqual(expected)
  expect(results.every(event => event.data.message.role === 'tool')).toBe(true)
  expect(() => parseSessionLog(current)).not.toThrow()
  expect(readFileSync(resolve(root, path))).toEqual(bytes)
})

it.each(fixtures)('%s cannot hide edits or a different reader outcome', (path) => {
  const source = readFileSync(resolve(root, path), 'utf8')
  expect(() => verifyAuthoredSessionRejection(path, source + '\n', 'restore', () => parseSessionLog(source))).toThrow('bytes changed')
  expect(() => verifyAuthoredSessionRejection(path, source, 'restore', () => [])).toThrow('exact malformed fixture refusal')
  expect(() => verifyAuthoredSessionRejection(path, source, 'restore', () => { throw new Error('other failure') })).toThrow('exact malformed fixture refusal')
  expect(verifyAuthoredSessionRejection(path.replace('.v3.', '.v4.'), source, 'restore', () => [])).toBe(false)
})

it('never grants an unknown path an exception', () => {
  expect(verifyAuthoredSessionRejection('unlisted/session.v3.jsonl', '', 'restore', () => [])).toBe(false)
})
