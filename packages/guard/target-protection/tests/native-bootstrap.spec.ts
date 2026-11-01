/** Startup identity stays bounded and leaves no listeners on admission, failure, or cancellation. @module */
import { PassThrough } from 'node:stream'
import { expect, it } from 'vitest'
import { readNativeBootstrapIdentity } from '../src/native-bootstrap.ts'

const line = Buffer.from(JSON.stringify({ nonce: 'expected', pid: 42, creationTime: '123' }) + '\n')

it('accepts every identity split and leaves subsequent bytes for the worker protocol', async () => {
  for (let split = 0; split <= line.length; split++) {
    const stream = new PassThrough(), abort = new AbortController()
    const result = readNativeBootstrapIdentity(stream, 'expected', 42, abort.signal)
    stream.write(line.subarray(0, split)); stream.write(line.subarray(split))
    expect(await result).toEqual({ pid: 42, creationTime: 123n })
    stream.write('framed output')
    const remaining: unknown = stream.read()
    expect(remaining).toEqual(Buffer.from('framed output'))
    expect(stream.listenerCount('data')).toBe(0)
    expect(stream.listenerCount('error')).toBe(0)
    stream.destroy()
  }
})

it.each([
  Buffer.alloc(4097, 65), Buffer.concat([line, Buffer.from('extra')]), Buffer.from('{}\n'),
  Buffer.from('{invalid}\n'), Buffer.from('{"nonce":"other","pid":42,"creationTime":"123"}\n'),
  Buffer.from('{"nonce":"expected","pid":41,"creationTime":"123"}\n'),
  Buffer.from('{"nonce":"expected","pid":42,"creationTime":"0"}\n'),
  Buffer.from('{"nonce":"expected","pid":42,"creationTime":"18446744073709551616"}\n'),
])('rejects malformed or mismatched startup data', async (bytes) => {
  const stream = new PassThrough()
  const pending = readNativeBootstrapIdentity(stream, 'expected', 42, new AbortController().signal)
  stream.write(bytes)
  await expect(pending).rejects.toBeDefined()
  expect(stream.listenerCount('data')).toBe(0)
  stream.destroy()
})

it.each(['end', 'close', 'error', 'abort', 'already-aborted', 'already-closed'] as const)('cleans up after startup %s', async (reason) => {
  const stream = new PassThrough(), abort = new AbortController()
  if (reason === 'already-aborted') abort.abort()
  if (reason === 'already-closed') stream.destroy()
  const pending = readNativeBootstrapIdentity(stream, 'expected', 42, abort.signal)
  if (reason === 'end') stream.end()
  if (reason === 'close') stream.destroy()
  if (reason === 'error') stream.destroy(new Error('read failure'))
  if (reason === 'abort') abort.abort()
  await expect(pending).rejects.toBeDefined()
  expect(stream.listenerCount('data')).toBe(0)
  stream.destroy()
})
