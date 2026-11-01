/** Per-invocation interpreter and string-only Host bridge. @module */
import type { MessagePort } from 'node:worker_threads'
import { stripTypeScriptTypes } from 'node:module'
import { newQuickJSWASMModuleFromVariant, Scope } from 'quickjs-emscripten-core'
import type { QuickJSDeferredPromise, QuickJSHandle } from 'quickjs-emscripten-core'
import variant from '@jitl/quickjs-wasmfile-release-sync'
import { ptcReply } from './ptc-protocol.ts'
import type { PtcBoot } from './ptc-protocol.ts'
import { PTC_BOOTSTRAP } from './ptc-bootstrap.ts'

/**
 * Run one program in a new interpreter and close the exclusive carrier when settled.
 * @param boot - Validated source, declarations and allocation budgets.
 * @param port - Exclusive Worker-side message endpoint.
 * @returns Completion after interpreter handles are released.
 */
export async function runPtcInterpreter(boot: PtcBoot, port: Pick<MessagePort, 'postMessage' | 'on' | 'removeAllListeners' | 'close'>): Promise<void> {
  using _carrier = { [Symbol.dispose]: () => { port.close() } }
  using _listener = { [Symbol.dispose]: () => { port.removeAllListeners('message') } }
  const prefix = 'async function __dsh_program__() {\n', suffix = '\n}'
  let program: string
  try {
    const stripped = stripTypeScriptTypes(prefix + boot.program + suffix)
    program = stripped.slice(prefix.length, stripped.length - suffix.length)
  } catch (error) {
    port.postMessage({ kind: 'done', error: { kind: 'exception',
      message: (error instanceof Error ? error.message : String(error)).slice(0, boot.limits.maxOutputBytes / 4) } })
    return
  }
  const module = await newQuickJSWASMModuleFromVariant(variant)
  using runtime = module.newRuntime({ memoryLimitBytes: boot.limits.memoryBytes, maxStackSizeBytes: boot.limits.stackBytes })
  using vm = runtime.newContext()
  const pending = new Map<number, QuickJSDeferredPromise>()
  const queuedLogs = new Map<number, number>()
  let nextId = 1, nextLogId = 1, finished = false, outputBytes = 0, logBytes = 0
  let main: QuickJSHandle | undefined
  const completion = Promise.withResolvers<void>()
  const message = (error: QuickJSHandle): string => {
    if (vm.typeof(error) === 'string') return vm.getString(error)
    if (vm.eq(error, vm.null) || !['object', 'function'].includes(vm.typeof(error))) return 'QuickJS program threw a non-Error value'
    using detail = vm.getProp(error, 'message')
    return vm.typeof(detail) === 'string' ? vm.getString(detail) : 'QuickJS program failed'
  }
  const finish = (result: { value?: string; error?: { kind: 'exception' | 'invalid-output' | 'output-limit' | 'protocol'; message: string } }): void => {
    if (finished) return
    finished = true
    try {
      port.postMessage({ kind: 'done', ...result })
      completion.resolve()
    } catch (error) { completion.reject(error) }
  }
  const pump = (): void => {
    if (finished || main === undefined) return
    using jobs = runtime.executePendingJobs()
    if (jobs.error !== undefined) { finish({ error: { kind: 'exception', message: message(jobs.error) } }); return }
    const state = vm.getPromiseState(main)
    if (state.type === 'pending') return
    if (state.type === 'rejected') {
      using error = state.error
      let kind: 'exception' | 'invalid-output' = 'exception'
      if (!vm.eq(error, vm.null) && ['object', 'function'].includes(vm.typeof(error))) {
        using failureKind = vm.getProp(error, 'ptcFailureKind')
        if (vm.typeof(failureKind) === 'string' && vm.getString(failureKind) === 'invalid-output') kind = 'invalid-output'
      }
      const detail = message(error)
      finish({ error: { kind, message: detail } })
    } else {
      using output = state.value
      const value = vm.getString(output)
      if (Buffer.byteLength(value) + outputBytes > boot.limits.maxOutputBytes) finish({ error: { kind: 'output-limit', message: 'QuickJS output limit exceeded' } })
      else finish({ value })
    }
  }

  try {
    port.on('message', (input: unknown) => {
      if (finished) return
      try {
        const reply = ptcReply.parse(input)
        if (reply.kind === 'log-received') {
          const bytes = queuedLogs.get(reply.id)
          if (bytes === undefined) { finish({ error: { kind: 'protocol', message: 'Unknown console acknowledgement' } }); return }
          queuedLogs.delete(reply.id)
          logBytes -= bytes
          return
        }
        if (Buffer.byteLength(reply.text) > boot.limits.maxMessageBytes) { finish({ error: { kind: 'protocol', message: 'Oversized binding reply' } }); return }
        const deferred = pending.get(reply.id)
        if (deferred === undefined) { finish({ error: { kind: 'protocol', message: 'Unknown binding reply' } }); return }
        port.postMessage({ kind: 'received', id: reply.id })
        using ownedDeferred = deferred
        pending.delete(reply.id)
        using value = vm.newString(reply.text)
        if (reply.ok) ownedDeferred.resolve(value)
        else ownedDeferred.reject(value)
        pump()
      } catch {
        finish({ error: { kind: 'protocol', message: 'Invalid binding reply or interpreter state' } })
      }
    })

    try {
      using send = vm.newFunction('binding', (index, args) => {
        if (vm.typeof(index) !== 'number' || vm.typeof(args) !== 'string') throw new Error('Invalid binding arguments')
        const text = vm.getString(args), binding = vm.getNumber(index)
        if (pending.size >= boot.limits.maxPendingCalls || Buffer.byteLength(text) > boot.limits.maxMessageBytes) throw new Error('Binding request limit exceeded')
        const id = nextId++, deferred = vm.newPromise()
        pending.set(id, deferred)
        port.postMessage({ kind: 'call', id, index: binding, args: text })
        return deferred.handle
      })
      using log = vm.newFunction('log', (value) => {
        if (vm.typeof(value) !== 'string') throw new Error('Invalid console output')
        const text = vm.getString(value)
        outputBytes += Buffer.byteLength(JSON.stringify(text)) + 1
        if (outputBytes > boot.limits.maxOutputBytes) { finish({ error: { kind: 'output-limit', message: 'QuickJS output limit exceeded' } }); throw new Error('QuickJS output limit exceeded') }
        const id = nextLogId++, emission = { kind: 'log', id, text }
        const bytes = Buffer.byteLength(JSON.stringify(emission))
        if (logBytes + bytes > boot.limits.maxMessageBytes) { finish({ error: { kind: 'output-limit', message: 'QuickJS console backlog exceeded' } }); throw new Error('QuickJS console backlog exceeded') }
        queuedLogs.set(id, bytes)
        logBytes += bytes
        port.postMessage(emission)
      })
      using factory = vm.unwrapResult(vm.evalCode(PTC_BOOTSTRAP))
      using source = vm.newString(program)
      using declarations = vm.newString(JSON.stringify(boot.namespaces))
      main = vm.unwrapResult(vm.callFunction(factory, vm.undefined, source, declarations, send, log))
      pump()
    } catch (error) {
      finish({ error: { kind: 'exception', message: error instanceof Error ? error.message : String(error) } })
    }

    await completion.promise
  } finally {
    using handles = new Scope()
    if (main !== undefined) handles.manage(main)
    for (const deferred of pending.values()) handles.manage(deferred)
  }
}
