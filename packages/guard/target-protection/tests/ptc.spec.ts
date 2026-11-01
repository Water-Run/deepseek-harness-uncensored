/** Capability-only interpreter behavior using real private Workers. @module */
import { executeModelToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { Context } from '@deepseek-ai/cordis'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import type { PtcBindingFunction, PtcRunRequest } from '@deepseek-ai/dsh-ptc-runtime'
import { mountAgentLoopTestDependencies, provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it, onTestFinished, vi } from 'vitest'
import { Worker } from 'node:worker_threads'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import TargetFileSystem from '../src/fs.ts'
import type { TargetRuleId } from '../src/types.ts'
import Protection from '../src/index.ts'
import TargetPtcRuntime from '../src/ptc.ts'
import type { PtcConfig } from '../src/ptc.ts'

async function harness(config: PtcConfig = {}, tools = false) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  if (tools) {
    await mountAgentLoopTestDependencies(ctx, { tools: { mode: 'ptc' } })
    provideWorkingDirectoryFixture(ctx, process.cwd())
  } else await ctx.plugin(SessionProjections)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: process.cwd() })
  const owner = await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await ctx.plugin(TargetPtcRuntime, config)
  const runtime = ctx.ptcRuntime
  const run = (request: PtcRunRequest) => runtime.run(runtime.resolve(request))
  return { ctx, owner, runtime, run }
}

it('runs useful JavaScript and async bindings with JSON output under active protection', async () => {
  const h = await harness()
  const echo: PtcBindingFunction = async (value) => {
    expect(value).toEqual({ input: 7 })
    return { multiplied: 42 }
  }
  const result = await h.run({ program: 'const data = await tools.echo({input:7}); console.log("ready",data); return data;',
    bindings: [{ global: 'tools', functions: { echo } }] })
  expect(result).toEqual({ logs: ['ready {"multiplied":42}'], value: { multiplied: 42 } })
})

it('accepts erasable TypeScript while rejecting unsupported compilation syntax', async () => {
  const h = await harness()
  expect((await h.run({ program: 'const value: number = 42; return value;', bindings: [] })).value).toBe(42)
  expect(await h.run({ program: 'enum Value {One};return Value.One;', bindings: [] })).toMatchObject({ error: { kind: 'exception' } })
})

it('uses the real run_code consumer through the normal tool pipeline', async () => {
  const h = await harness({}, true)
  const echo = vi.fn(async (value: { input: number }) => value.input * 6)
  h.ctx.tools.register(defineTool({
    name: 'multiply', description: 'Multiply the supplied number by six.',
    parameters: { input: { type: 'number', required: true } },
    output: { schema: { type: 'number' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    execute: echo,
  }))
  const assembly = await h.ctx.systemPrompt.assemble()
  expect(assembly.tools.map(tool => tool.name)).toEqual(['run_code'])
  expect(assembly.sections.find(section => section.name === 'tools:sdk')?.text).toContain('multiply')
  const result = await executeModelToolFixture(h.ctx, { name: 'run_code', arguments: {
    code: 'const output: number = await tools.multiply({input:7}); return output;', description: 'Compute using the declared tool.',
  }, callId: ToolCallId('protected-ptc-consumer'), signal: new AbortController().signal })
  expect(result).toMatchObject({ isError: false, value: { logs: [], result: 42 } })
  expect(echo).toHaveBeenCalledOnce()
})

it('cancels and drains an unawaited tool before run_code reports cancellation', async () => {
  const h = await harness({}, true)
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const aborted: PromiseWithResolvers<void> = Promise.withResolvers()
  const cleanup: PromiseWithResolvers<void> = Promise.withResolvers()
  const controller = new AbortController()
  onTestFinished(() => { controller.abort(); cleanup.resolve() })
  let cleaned = false, completed = false
  h.ctx.tools.register(defineTool({ name: 'delayed', description: 'Wait for cancellation and owned cleanup.', parameters: {},
    isConcurrencySafe: () => true,
    output: { schema: { type: 'number' }, render: () => [] },
    async execute(_args, execution) {
      entered.resolve()
      if (!execution.signal.aborted) await new Promise<void>((resolve) => {
        execution.signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
      aborted.resolve()
      await cleanup.promise
      cleaned = true
      return 0
    },
  }))
  const running = executeModelToolFixture(h.ctx, { name: 'run_code', arguments: {
    code: 'tools.delayed({});await new Promise(()=>{});', description: 'Verify cancellation cleanup.',
  }, callId: ToolCallId('ptc-owned-cleanup'), signal: controller.signal })
  void running.then(() => { completed = true })
  try {
    await Promise.race([entered.promise, running.then(() => { throw new Error('run_code ended before the nested tool started') })])
    controller.abort()
    await aborted.promise
    expect(completed).toBe(false)
    expect(cleaned).toBe(false)
  } finally { cleanup.resolve() }
  expect(await running).toMatchObject({ isError: true })
  expect(cleaned).toBe(true)
})

it('exposes neither native APIs nor a Host constructor through the interpreter', async () => {
  const h = await harness()
  const result = await h.run({ program: 'return {process:typeof process,require:typeof require,fetch:typeof fetch,worker:typeof Worker,timer:typeof setTimeout,buffer:typeof Buffer};', bindings: [] })
  expect(result.value).toEqual({ process: 'undefined', require: 'undefined', fetch: 'undefined', worker: 'undefined', timer: 'undefined', buffer: 'undefined' })
  expect(await h.run({ program: 'return globalThis.constructor.constructor("return process")();', bindings: [] })).toMatchObject({ error: { kind: 'exception' } })
  expect(await h.run({ program: 'return await import("node:fs");', bindings: [] })).toMatchObject({ error: { kind: 'exception' } })
})

it('materializes binding rejection classes and reserved member names without Host prototypes', async () => {
  const h = await harness()
  const functions: Record<string, PtcBindingFunction> = {}
  Object.defineProperty(functions, 'constructor', { enumerable: true, value: async () => { throw new Error('owned rejection') } })
  Object.defineProperty(functions, '__proto__', { enumerable: true, value: async () => 17 })
  const result = await h.run({ program: 'try {await tools.constructor({});} catch(error) {return {typed:error instanceof ToolCallError,name:error.name,member:error.toolName,value:await tools.__proto__({})};}',
    bindings: [{ global: 'tools', functions, errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' } }] })
  expect(result.value).toEqual({ typed: true, name: 'ToolCallError', member: 'constructor', value: 17 })
})

it.each(['return undefined;', 'console.log("hello");'])('supports completion without a value: %s', async (program) => {
  const h = await harness(), result = await h.run({ program, bindings: [] })
  expect(result.error).toBeUndefined()
  expect(Object.hasOwn(result, 'value')).toBe(false)
})

it.each(['return NaN;', 'return -0;', 'return {missing:undefined};', 'const x={};x.self=x;return x;', 'return [,,];', 'return 10n;'])('rejects lossy completion: %s', async (program) => {
  const h = await harness()
  expect(await h.run({ program, bindings: [] })).toMatchObject({ error: { kind: 'invalid-output' } })
})

it('hard-stops a busy interpreter after an observed binding barrier and awaits Worker exit', async () => {
  const h = await harness()
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const controller = new AbortController()
  const terminated: number[] = []
  // oxlint-disable-next-line typescript/unbound-method -- invoked below with the original Worker as its receiver.
  const original = Worker.prototype.terminate
  const spy = vi.spyOn(Worker.prototype, 'terminate').mockImplementation(async function (this: Worker) {
    const code = await original.call(this); terminated.push(this.threadId); return code
  })
  onTestFinished(() => { spy.mockRestore() })
  const pending = h.run({ program: 'await tools.enter({});for(;;){}', timeoutMs: null, signal: controller.signal,
    bindings: [{ global: 'tools', functions: { enter: async () => { entered.resolve(); return null } } }] })
  await entered.promise
  controller.abort()
  expect(await pending).toMatchObject({ error: { kind: 'abort' } })
  expect(terminated).toEqual([-1])
})

it('enforces the wall deadline after actual program entry', async () => {
  const h = await harness()
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  onTestFinished(() => { vi.useRealTimers() })
  const pending = h.run({ program: 'await tools.enter({});for(;;){}', timeoutMs: 1000,
    bindings: [{ global: 'tools', functions: { enter: async () => { entered.resolve(); return null } } }] })
  await entered.promise
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toMatchObject({ error: { kind: 'timeout' } })
})

it('keeps invocations isolated and cancels live programs when rules change', async () => {
  const h = await harness()
  expect((await h.run({ program: 'globalThis.saved=12;return saved;', bindings: [] })).value).toBe(12)
  expect((await h.run({ program: 'return typeof saved;', bindings: [] })).value).toBe('undefined')
  const entered: PromiseWithResolvers<void> = Promise.withResolvers()
  const pending = h.run({ program: 'await tools.enter({});for(;;){}', timeoutMs: null,
    bindings: [{ global: 'tools', functions: { enter: async () => { entered.resolve(); return null } } }] })
  await entered.promise
  const before = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, before.revision)
  expect(await pending).toMatchObject({ error: { kind: 'abort' } })
})

it('bounds console output and leaves the Host usable after Worker exhaustion', async () => {
  const h = await harness({ maxOutputBytes: 1024, memoryBytes: 1048576 })
  expect(await h.run({ program: 'console.log("x".repeat(4096));', bindings: [] })).toMatchObject({ error: { kind: 'output-limit' } })
  const exhausted = await h.run({ program: 'const x=[];for(;;)x.push("y".repeat(10000));', bindings: [] })
  expect(exhausted.error?.kind).toMatch(/^(exception|worker-exit)$/)
  expect((await h.run({ program: 'return 42;', bindings: [] })).value).toBe(42)
})

it('executes real test-file writes while the same program cannot change a protected production file', async () => {
  const h = await harness(), root = await mkdtemp(join(tmpdir(), 'dshu-ptc-files-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const production = join(root, 'production.txt'), test = join(root, 'test.txt')
  await writeFile(production, 'preserve')
  await writeFile(test, 'before')
  await h.ctx.plugin(TargetFileSystem, { cwd: root })
  const before = await h.ctx.targetProtection.snapshot()
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id: brandString<TargetRuleId>(randomUUID()), name: 'owned production', enabled: true, kind: 'database',
      environment: 'production', protection: 'full', match: 'path', address: production },
    { id: brandString<TargetRuleId>(randomUUID()), name: 'owned test', enabled: true, kind: 'database',
      environment: 'test', protection: 'full', match: 'path', address: test },
  ] }, before.revision)
  const write: PtcBindingFunction = async (input) => {
    const args = z.object({ path: z.string(), text: z.string() }).parse(input)
    await h.ctx.fs.writeText(await h.ctx.fs.resolve(args.path), args.text)
    return null
  }
  const program = 'let refused=false;try {await tools.write({path:' + JSON.stringify(production)
    + ',text:"must-not-write"});}catch(error){refused=error instanceof ToolCallError;}'
    + 'await tools.write({path:' + JSON.stringify(test) + ',text:"changed"});return {refused};'
  const result = await h.run({ program, bindings: [{ global: 'tools', functions: { write },
    errorClass: { name: 'ToolCallError', memberNameProperty: 'toolName' } }] })
  expect(result).toEqual({ logs: [], value: { refused: true } })
  expect(await readFile(production, 'utf8')).toBe('preserve')
  expect(await readFile(test, 'utf8')).toBe('changed')
})

it('keeps JSON serialization stable after interpreter prototype pollution', async () => {
  const h = await harness()
  expect(await h.run({ program: 'Object.prototype.toJSON=()=>99;Array.prototype.toJSON=()=>88;JSON.stringify=()=>42;return {list:[1,2],safe:true};', bindings: [] }))
    .toEqual({ logs: [], value: { list: [1, 2], safe: true } })
  expect(await h.run({ program: 'RegExp.prototype.test=()=>true;const x=[1];x.bad=2;return x;', bindings: [] })).toMatchObject({ error: { kind: 'invalid-output' } })
  expect(await h.run({ program: 'Object.prototype.value=99;const x={get unsafe(){return 42}};return x;', bindings: [] })).toMatchObject({ error: { kind: 'invalid-output' } })
})
