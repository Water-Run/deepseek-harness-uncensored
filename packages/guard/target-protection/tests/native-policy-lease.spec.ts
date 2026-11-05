/** Policy changes commit only after every admitted native execution confirms shutdown. @module */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished } from 'vitest'
import TargetProtection, { TargetStore } from '../src/index.ts'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-policy-')), ctx = new Context()
  const releaseAll: (() => void)[] = []
  onTestFinished(async () => {
    for (const release of releaseAll) release()
    await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true })
  })
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: '', busyTimeoutMs: 10 })
  const external = await TargetStore.open(join(root, 'rules.sqlite'), 10)
  onTestFinished(() => { external.close() })
  const native = () => {
    const stopping = Promise.withResolvers<boolean>(), close = Promise.withResolvers<boolean>()
    let release = () => {}
    release = ctx.targetProtection.retainNativeExecution(1, async () => { stopping.resolve(true); await close.promise; release() })
    releaseAll.push(() => { close.resolve(true); release() })
    return { stopping: stopping.promise, close: () => { close.resolve(true) }, release }
  }
  return { ctx, external, native, releaseAll }
}

it('holds the committed policy through concurrent native shutdown and refuses new admission', async () => {
  const h = await fixture(), first = h.native(), second = h.native()
  const change = h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)
  await Promise.all([first.stopping, second.stopping])
  expect(h.external.snapshot().revision).toBe(1)
  expect(() => h.external.configure({ mainlandEnabled: false, rules: [] }, 1)).toThrow(expect.objectContaining({ code: 'busy' }))
  expect(() => h.ctx.targetProtection.retainNativeExecution(1, async () => {})).toThrow(expect.objectContaining({ code: 'busy' }))
  first.close(); await Promise.resolve()
  expect(h.external.snapshot().revision).toBe(1)
  second.close()
  expect((await change).revision).toBe(2)
  expect(h.external.snapshot().revision).toBe(2)
  expect(h.ctx.targetProtection.executionSignal().aborted).toBe(false)
})

it('rejects stale edits without cancelling the execution that owns the current revision', async () => {
  const h = await fixture(), active = h.native()
  const signal = h.ctx.targetProtection.executionSignal()
  await expect(h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 0)).rejects.toMatchObject({ code: 'conflict' })
  expect(signal.aborted).toBe(false)
  active.close(); active.release()
})

it('preserves the committed rules when the editor disconnects during native shutdown', async () => {
  const h = await fixture(), active = h.native(), editor = new AbortController()
  const change = h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, 1, editor.signal)
  const outcome = change.catch((error: unknown) => error)
  await active.stopping
  editor.abort()
  active.close()
  expect(await outcome).toBe(editor.signal.reason)
  expect(h.external.snapshot()).toEqual({ revision: 1, preferences: { mainlandEnabled: false, rules: [] } })
  expect(h.ctx.targetProtection.executionSignal().aborted).toBe(false)
})

it('keeps new execution disabled when physical shutdown cannot be confirmed', async () => {
  const h = await fixture()
  const release = h.ctx.targetProtection.retainNativeExecution(1, async () => { throw new Error('unconfirmed native shutdown') })
  h.releaseAll.push(release)
  await expect(h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)).rejects.toThrow('unconfirmed native shutdown')
  expect(h.external.snapshot().revision).toBe(1)
  expect(() => h.ctx.targetProtection.retainNativeExecution(1, async () => {})).toThrow(expect.objectContaining({ code: 'unavailable' }))
  await expect(h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)).rejects.toThrow('unconfirmed native shutdown')
  expect(() => h.ctx.targetProtection.retainNativeExecution(1, async () => {})).toThrow(expect.objectContaining({ code: 'unavailable' }))
  expect(() => h.external.configure({ mainlandEnabled: false, rules: [] }, 1)).toThrow(expect.objectContaining({ code: 'busy' }))
  release()
  expect(h.ctx.targetProtection.executionSignal().aborted).toBe(false)
})

it('serializes owner edits while a country-source change interrupts the same native execution', async () => {
  const h = await fixture(), active = h.native()
  const first = h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)
  const stale = expect(h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [] }, 1)).rejects.toMatchObject({ code: 'conflict' })
  await active.stopping
  h.ctx.emit('target-country/changed')
  active.close()
  expect((await first).revision).toBe(2)
  await stale
  const signal = h.ctx.targetProtection.executionSignal()
  expect(signal.aborted).toBe(false)
  h.ctx.emit('target-country/changed')
  expect(signal.aborted).toBe(true)
})

it('rechecks a failed shutdown on an explicit owner retry before accepting new rules', async () => {
  const h = await fixture()
  let attempts = 0, release = () => {}
  release = h.ctx.targetProtection.retainNativeExecution(1, async () => {
    if (++attempts === 1) throw new Error('native observation unavailable')
    release()
  })
  h.releaseAll.push(release)
  await expect(h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1))
    .rejects.toThrow('native observation unavailable')
  expect(h.external.snapshot().revision).toBe(1)
  expect((await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)).revision).toBe(2)
  expect(attempts).toBe(2)
})

it('retains the registry through owner disposal until native closure is acknowledged', async () => {
  const h = await fixture(), active = h.native()
  const closing = h.ctx.fiber.dispose()
  await active.stopping
  expect(() => h.external.configure({ mainlandEnabled: false, rules: [] }, 1)).toThrow(expect.objectContaining({ code: 'busy' }))
  active.close()
  await closing
  expect(h.external.configure({ mainlandEnabled: false, rules: [] }, 1).revision).toBe(2)
})

it('waits for source invalidation and retains cancellation after a normal subsequent release', async () => {
  const h = await fixture(), active = h.native()
  h.ctx.emit('target-country/changed')
  await active.stopping
  expect(h.ctx.targetProtection.executionSignal().aborted).toBe(true)
  expect(() => h.ctx.targetProtection.retainNativeExecution(1, async () => {})).toThrow(expect.objectContaining({ code: 'busy' }))
  active.close(); active.release()
  const next = h.native(), signal = h.ctx.targetProtection.executionSignal()
  next.release()
  expect(signal.aborted).toBe(false)
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, 1)
  expect(signal.aborted).toBe(true)
})
