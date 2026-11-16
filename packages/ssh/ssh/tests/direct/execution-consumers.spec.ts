/** Remote handles keep their allocating connection after execution selection changes. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import { FsTargetKey } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import SshFileSystem from '@deepseek-ai/dsh-fs-ssh'
import { SshSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-ssh'
import type { SshService } from '../../src/index.ts'
import { helloSchema } from '../../src/schemas.ts'
import { Socket } from 'node:net'
import { expect, it, onTestFinished } from 'vitest'
import { hello } from './peer.ts'

const id = 'aa910b47-e7d7-467b-8421-3331569dd02b'
const complete = { outcome: { exitCode: 0, signal: null }, spills: {}, collected: {} }

async function setup() {
  const ctx = new Context(), sockets = new Set<Socket>()
  const finished = Promise.withResolvers<typeof complete>()
  const calls: string[] = [], other: string[] = []
  let terminal = false
  const first: SshService = {
    ready: Promise.resolve(helloSchema.parse(hello)),
    ptcLaunch: { kind: 'embedded', executable: '/remote/helper' },
    request: async (method, params, result) => {
      calls.push(method)
      let value: unknown
      if (method === 'fs.stream') value = id
      else if (method === 'fs.next') value = { done: false, value: 'owned' }
      else if (method === 'fs.streamClose') value = null
      else if (method === 'process.prepare') {
        terminal = typeof params === 'object' && params !== null && 'terminal' in params
        value = { id, streams: terminal ? { terminal: { path: '/tmp/terminal', capability: 'a'.repeat(64) } } : {} }
      } else if (method === 'process.start') value = terminal ? { pid: 321 } : {}
      else if (method === 'process.done') value = await finished.promise
      else if (method === 'process.wait') value = true
      else if (method === 'process.terminate') { finished.resolve(complete); value = null }
      else if (method === 'terminal.write' || method === 'terminal.resize') value = null
      else throw new Error(`Unexpected remote operation: ${method}`)
      return result.parse(value)
    },
    connectStream: async () => {
      const socket = new Socket()
      socket.on('error', () => {})
      sockets.add(socket)
      return socket
    },
    dispose: async () => { finished.resolve(complete) },
  }
  const second: SshService = { ...first, request: async (method) => {
    other.push(method)
    throw new Error('A captured resource was redirected to another connection')
  } }
  let selected = first
  ctx.provide('ssh', { ...first, captureExecution: () => selected,
    request: (method, params, result, signal, wait) => selected.request(method, params, result, signal, wait),
  })
  onTestFinished(async () => {
    finished.resolve(complete)
    try { await ctx.fiber.dispose() }
    finally {
      await Promise.all([...sockets].map(socket => new Promise<void>((resolve) => {
        if (socket.closed) resolve()
        else { socket.once('close', () => { resolve() }); socket.destroy() }
      })))
    }
  })
  class Policy extends Service {
    readonly defaultMode = 'read-only'
    constructor(scope: Context) { super(scope, 'sandboxPolicy') }
    resolve(): SandboxExecutionPolicy { return { mode: 'read-only', workspaceRoot: '/remote/workspace' } }
  }
  await ctx.plugin(Policy)
  await ctx.plugin(SshFileSystem)
  await ctx.plugin(SshSubprocessRuntime)
  return { ctx, calls, other, switchOwner: () => { selected = second } }
}

it('reads and closes a file stream through its allocating connection', async () => {
  const h = await setup()
  const stream = await h.ctx.fs.streamText({ targetKey: FsTargetKey('/remote/workspace/data'), displayPath: 'data' })
  h.switchOwner()
  const iterator = stream[Symbol.asyncIterator]()
  expect(await iterator.next()).toEqual({ done: false, value: 'owned' })
  await iterator.return?.()
  expect(h.calls).toEqual(['fs.stream', 'fs.next', 'fs.streamClose'])
  expect(h.other).toEqual([])
})

it('writes, resizes and terminates a terminal through its allocating connection', async () => {
  const h = await setup()
  const terminal = await h.ctx.subprocess.spawnTerminal({ argv: ['bash'], cwd: '/remote/workspace', terminalType: 'dumb', rows: 24, cols: 80, graceMs: 100 })
  h.switchOwner()
  await terminal.write('owned')
  await terminal.resize(100, 30)
  await terminal.terminate()
  await terminal.done
  expect(h.calls).toContain('terminal.write')
  expect(h.calls).toContain('terminal.resize')
  expect(h.calls).toContain('process.terminate')
  expect(h.other).toEqual([])
})

it('starts and terminates an ordinary process through its allocating connection', async () => {
  const h = await setup()
  const process = h.ctx.subprocess.spawn({ argv: ['true'], cwd: '/remote/workspace', graceMs: 100,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' } })
  h.switchOwner()
  await expect.poll(() => h.calls.includes('process.done')).toBe(true)
  process.terminate()
  await process.waitForExit()
  process.stdout?.destroy()
  process.stderr?.destroy()
  await process.done
  expect(h.calls).toContain('process.start')
  expect(h.calls).toContain('process.terminate')
  expect(h.other).toEqual([])
})
