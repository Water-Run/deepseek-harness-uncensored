/** Real commands exchange independent framed streams without inheriting bootstrap state. @module */
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { runNativeWorker, type NativeWorkerLaunch } from '../src/native-worker.ts'
import { NATIVE_FRAME, readNativeFrames, writeNativeFrame } from '../src/native-protocol.ts'
import type { NativeFrame } from '../src/native-protocol.ts'

vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn(actual.spawn) }
})
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

function harness(outputHighWaterMark = 64 * 1024) {
  const input = new PassThrough(), output = new PassThrough({ highWaterMark: outputHighWaterMark })
  const frames = readNativeFrames(output), received: NativeFrame[] = []
  const done = runNativeWorker(input, output).finally(() => { output.end() })
  void done.catch(() => {}) // Each case observes its result; cleanup also awaits it after terminating the owned transport.
  onTestFinished(async () => { input.destroy(); output.destroy(); await Promise.allSettled([done, frames.return(undefined)]) })
  const next = async (tag: number) => {
    while (true) {
      const item = await frames.next()
      if (item.done) throw new Error(`Missing native frame ${tag}`)
      received.push(item.value)
      if (item.value.tag === tag) return item.value
    }
  }
  return { input, output, done, received,
    send(tag: number, data = Buffer.alloc(0)) { return writeNativeFrame(input, { tag, data }) },
    next,
    async closed(tags: number[]) {
      while (tags.some(tag => !received.some(frame => frame.tag === NATIVE_FRAME.streamClosed && frame.data[0] === tag))) {
        await next(NATIVE_FRAME.streamClosed)
      }
    },
  }
}

function request(source: string, overrides: Partial<NativeWorkerLaunch> = {}): NativeWorkerLaunch {
  return { argv: [process.execPath, '-e', source], cwd: process.cwd(), env: { SystemRoot: process.env.SystemRoot ?? '' },
    stdin: 'pipe', control: false, ...overrides }
}

it('keeps binary output opaque, isolates stderr, and reports direct exit separately', async () => {
  const h = harness()
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request(`
process.stderr.write('错误 ✓');
process.stdin.on('data', chunk => process.stdout.write(chunk));
process.stdin.on('end', () => { process.exitCode = 37 });`))))
  await h.next(NATIVE_FRAME.started)
  const binary = Buffer.from([0, NATIVE_FRAME.exited, 0, 0, 0, 2, 123, 125, 255, 128, 13, 10])
  await h.send(NATIVE_FRAME.stdin, binary)
  await h.send(NATIVE_FRAME.stdinEnd)
  expect(JSON.parse(Buffer.from((await h.next(NATIVE_FRAME.exited)).data).toString())).toEqual({ exitCode: 37, signal: null })
  await h.closed([NATIVE_FRAME.stdout, NATIVE_FRAME.stderr])
  expect(Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.stdout).map(frame => Buffer.from(frame.data)))).toEqual(binary)
  expect(Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.stderr).map(frame => Buffer.from(frame.data))).toString()).toBe('错误 ✓')
  h.input.end(); await h.done
})

it('uses only the requested environment and preserves literal arguments', async () => {
  const h = harness()
  const launch = request('console.log(JSON.stringify({ inherited: process.env.VITEST ?? null, value: process.env.NATIVE_VALUE, args: process.argv.slice(1) }))', {
    stdin: 'ignore', env: { SystemRoot: process.env.SystemRoot ?? '', NATIVE_VALUE: 'explicit' },
  })
  launch.argv.push('literal $HOME ${UNCHANGED}', '"quoted"', '中文')
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(launch)))
  await h.next(NATIVE_FRAME.exited)
  await h.closed([NATIVE_FRAME.stdout, NATIVE_FRAME.stderr])
  const text = Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.stdout).map(frame => Buffer.from(frame.data))).toString()
  expect(JSON.parse(text)).toEqual({ inherited: null, value: 'explicit', args: ['literal $HOME ${UNCHANGED}', '"quoted"', '中文'] })
  h.input.end(); await h.done
})

it('preserves buffered stdout under backpressure at child exit', async () => {
  const h = harness(1)
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request(
    "process.stdin.once('data',()=>process.stdout.write(Buffer.alloc(100*1024,97),()=>process.exit(0)))",
  ))))
  await h.next(NATIVE_FRAME.started)
  const result = vi.mocked(spawn).mock.results.at(-1)
  if (result?.type !== 'return') throw new Error('Missing owned command')
  const childClosed = new Promise<void>((resolve) => { result.value.once('close', () => { resolve() }) })
  await h.send(NATIVE_FRAME.stdin, Buffer.from('go'))
  await childClosed
  await h.next(NATIVE_FRAME.exited)
  await h.closed([NATIVE_FRAME.stdout, NATIVE_FRAME.stderr])
  const bytes = Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.stdout).map(frame => Buffer.from(frame.data)))
  expect(bytes.length).toBe(100 * 1024)
  expect(bytes).toEqual(Buffer.alloc(100 * 1024, 97))
  h.input.end(); await h.done
})

it('keeps descriptor-seven bytes separate from standard output', async () => {
  const h = harness()
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request(`
const { Socket }=require('node:net');
if(process.env.DSH_SUBPROCESS_CONTROL!=='pipe') throw Error('missing control');
const control=new Socket({fd:7,readable:true,writable:true,allowHalfOpen:true});
let received=0,flushed=0;
control.on('data',chunk=>{received+=chunk.length;control.write(chunk,()=>{flushed+=chunk.length})});
control.on('end',()=>control.end(()=>process.stderr.write(JSON.stringify({received,flushed}))));
process.stdout.write('ordinary output');`, { stdin: 'ignore', control: true,
    env: { SystemRoot: process.env.SystemRoot ?? '', dsh_subprocess_control: 'must-be-replaced' },
  }))))
  await h.next(NATIVE_FRAME.started)
  const payload = Buffer.alloc(128 * 1024, 0xa5)
  await h.send(NATIVE_FRAME.control, payload); await h.send(NATIVE_FRAME.controlEnd)
  await h.next(NATIVE_FRAME.exited)
  await h.closed([NATIVE_FRAME.stdout, NATIVE_FRAME.stderr, NATIVE_FRAME.controlOutput])
  const returned = Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.controlOutput).map(frame => Buffer.from(frame.data)))
  const diagnostic = Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.stderr)
    .map(frame => Buffer.from(frame.data))).toString()
  expect(returned.length, diagnostic).toBe(payload.length)
  expect(returned).toEqual(payload)
  expect(Buffer.concat(h.received.filter(frame => frame.tag === NATIVE_FRAME.stdout).map(frame => Buffer.from(frame.data))).toString()).toBe('ordinary output')
  h.input.end(); await h.done
})

it('reports a spawn failure without exposing the launch payload', async () => {
  const h = harness()
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request('', {
    argv: ['dshu-missing-native-test-executable-90c83d2e'], env: { NATIVE_SECRET: 'must-not-be-reported' },
  }))))
  expect(JSON.parse(Buffer.from((await h.next(NATIVE_FRAME.failed)).data).toString())).toEqual({ code: 'ENOENT' })
  await expect(h.done).rejects.toMatchObject({ cause: { code: 'ENOENT' } })
})

it.each([
  { tag: NATIVE_FRAME.stdin, data: Buffer.alloc(0) },
  { tag: NATIVE_FRAME.launch, data: Buffer.from('{}') },
  { tag: NATIVE_FRAME.launch, data: Buffer.from('{invalid') },
])('rejects invalid startup without running a target', async (frame) => {
  const h = harness()
  await h.send(frame.tag, frame.data)
  expect((await h.next(NATIVE_FRAME.failed)).data.byteLength).toBeGreaterThan(0)
  await expect(h.done).rejects.toBeDefined()
})

it.each([NATIVE_FRAME.launch, NATIVE_FRAME.control, NATIVE_FRAME.controlEnd, NATIVE_FRAME.stdin, NATIVE_FRAME.stdinEnd])('stops on invalid frame %s after launch', async (tag) => {
  const h = harness()
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request('setInterval(()=>{},1000)', { stdin: 'ignore' }))))
  await h.next(NATIVE_FRAME.started)
  await h.send(tag)
  expect(JSON.parse(Buffer.from((await h.next(NATIVE_FRAME.failed)).data).toString())).toEqual({ code: 'NATIVE_PROTOCOL_FAILED' })
  await expect(h.done).rejects.toMatchObject({ cause: { name: 'NativeProtocolError' } })
})

it('contains a target stdin failure while the command is still running', async () => {
  const h = harness()
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request('setInterval(()=>{},1000)'))))
  await h.next(NATIVE_FRAME.started)
  const result = vi.mocked(spawn).mock.results.at(-1)
  if (result?.type !== 'return' || result.value.stdin === null) throw new Error('Missing owned target stdin')
  const failure = Object.assign(new Error('target stdin failed'), { code: 'EPIPE' })
  vi.spyOn(result.value.stdin, '_write').mockImplementationOnce((_chunk, _encoding, callback) => { callback(failure) })
  await h.send(NATIVE_FRAME.stdin, Buffer.from('cannot deliver'))
  expect(JSON.parse(Buffer.from((await h.next(NATIVE_FRAME.failed)).data).toString())).toEqual({ code: 'EPIPE' })
  await expect(h.done).rejects.toBeDefined()
})

it('does not lose a transport failure arriving with input EOF', async () => {
  const h = harness(), failure = new Error('output failed at EOF')
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request('setInterval(()=>{},1000)', { stdin: 'ignore' }))))
  await h.next(NATIVE_FRAME.started)
  h.input.once('end', () => { h.output.emit('error', failure) })
  h.input.end()
  await expect(h.done).rejects.toMatchObject({ cause: failure })
})

it('reports the original failure and an unavailable error-reporting transport', async () => {
  const h = harness()
  h.output.destroy(new Error('transport unavailable'))
  await expect(h.done).rejects.toBeInstanceOf(AggregateError)
})

it('stops an idle command when the output transport closes without an error event', async () => {
  const h = harness()
  await h.send(NATIVE_FRAME.launch, Buffer.from(JSON.stringify(request('setInterval(()=>{},1000)', { stdin: 'ignore' }))))
  await h.next(NATIVE_FRAME.started)
  h.output.destroy()
  await expect(h.done).rejects.toBeInstanceOf(AggregateError)
  expect(h.input.destroyed).toBe(true)
})
