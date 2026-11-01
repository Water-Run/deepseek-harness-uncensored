/** Native Worker startup failures and the source-launch environment. @module */
import { Context } from '@deepseek-ai/cordis'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import type { WorkerOptions } from 'node:worker_threads'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished, vi } from 'vitest'
import Protection from '../src/index.ts'
import TargetPtcRuntime from '../src/ptc.ts'

const nativeState = vi.hoisted((): { error?: Error | string; options?: WorkerOptions | undefined } => ({}))
vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>()
  return { ...native, Worker: class extends native.Worker {
    constructor(...args: ConstructorParameters<typeof native.Worker>) {
      if (nativeState.error !== undefined) throw nativeState.error
      nativeState.options = args[1]
      super(...args)
    }
  } }
})

async function harness() {
  const ctx = new Context()
  onTestFinished(async () => { delete nativeState.error; delete nativeState.options; await ctx.fiber.dispose() })
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: process.cwd() })
  await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await ctx.plugin(TargetPtcRuntime, { maxWorkers: 1 })
  const run = () => ctx.ptcRuntime.run(ctx.ptcRuntime.resolve({ program: 'return 42', bindings: [] }))
  return { ctx, run }
}

it.each([new Error('owned startup failure'), 'untyped startup failure'])('releases admission after Worker startup fails: %s', async (error) => {
  const h = await harness()
  nativeState.error = error
  expect(await h.run()).toMatchObject({ error: { kind: 'worker-exit' } })
  delete nativeState.error
  expect(await h.run()).toEqual({ logs: [], value: 42 })
})

it('retains only explicit temporary paths and source configuration in the Worker environment', async () => {
  const previous = process.env.TSX_TSCONFIG_PATH
  onTestFinished(() => {
    if (previous === undefined) delete process.env.TSX_TSCONFIG_PATH
    else process.env.TSX_TSCONFIG_PATH = previous
  })
  const path = resolve('tsconfig.base.json')
  process.env.TSX_TSCONFIG_PATH = path
  const h = await harness()
  expect(await h.run()).toEqual({ logs: [], value: 42 })
  expect(nativeState.options?.env).toEqual({ TEMP: tmpdir(), TMP: tmpdir(), TMPDIR: tmpdir(),
    TSX_TSCONFIG_PATH: path })
})
