// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '../src/client/registry.ts'
import type { SlotScopeAdapter, StandardSourceBinding } from '../src/client/index.ts'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-renderer'
import * as UiRenderer from '../src/client/index.ts'
import { ScopeProvider } from '../src/client/bindings.tsx'

const mounted: (() => void)[] = []

afterEach(() => {
  act(() => { for (const unmount of mounted.splice(0)) unmount() })
  vi.restoreAllMocks()
  cleanup()
  document.body.innerHTML = ''
})

const stabilize = async (fn: () => void | Promise<void>): Promise<void> => {
  await act(async () => { await fn() })
}

async function bench(withScope = true) {
  const ctx = new Context()
  const fiber = ctx.plugin({ inject: [...UiRenderer.inject], apply: UiRenderer.apply })
  await fiber.await()
  const slots = ctx.get('slots') as SlotRegistry
  const absentBinding: StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }
  const current = {
    getSnapshot: () => absentBinding,
    subscribe: () => () => {},
  }
  const adapter: SlotScopeAdapter = {
    current,
    bindingSource: () => current,
  }
  if (withScope) slots.installScope('session', adapter)
  return { ctx, slots, fiber, adapter }
}

function container(): HTMLElement {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}

describe('UI renderer plugin', () => {
  it('mounts withdrawn when it joins a replacement and renders after the resume callback', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="late-root" />)
    const el = container()
    let resume = () => {}
    let unmount = () => {}
    try {
      act(() => { unmount = ctx.uiRenderer.mount(el, (prepare) => { resume = prepare(); return () => {} }) })
      expect(el.querySelector('[data-testid="late-root"]')).toBeNull()
      act(() => { resume() })
      expect(el.querySelector('[data-testid="late-root"]')).toBeTruthy()
    } finally { act(unmount); await ctx.fiber.dispose() }
  })

  it('unmounts scope consumers before their adapter is removed and restores them afterward', async () => {
    const { ctx, slots, adapter } = await bench(false)
    const owner = ctx.plugin({ inject: ['slots'], apply(scope: Context) { scope.slots.installScope('session', adapter) } })
    await owner.await()
    slots.register({ name: 'root' }, () => <ScopeProvider scope="session-maybe"><div data-testid="scope-probe" /></ScopeProvider>)
    const el = container()
    const unwatch = vi.fn()
    let prepare: (() => () => void) | undefined
    let unmount = () => {}
    try {
      act(() => { unmount = ctx.uiRenderer.mount(el, (callback) => { prepare = callback; return unwatch }) })
      expect(el.querySelector('[data-testid="scope-probe"]')).toBeTruthy()
      if (prepare === undefined) throw new Error('Missing consumer teardown registration')
      let resume = () => {}
      act(() => { resume = prepare!() })
      expect(el.querySelector('[data-testid="scope-probe"]')).toBeNull()
      await stabilize(() => owner.dispose())
      const replacement = ctx.plugin({ inject: ['slots'], apply(scope: Context) { scope.slots.installScope('session', { ...adapter }) } })
      await stabilize(async () => { await replacement.await() })
      act(() => { resume() })
      expect(el.querySelector('[data-testid="scope-probe"]')).toBeTruthy()
      act(() => { unmount(); unmount = () => {}; resume() })
      expect(unwatch).toHaveBeenCalledOnce()
    } finally { act(unmount); await ctx.fiber.dispose() }
  })

  it('provides no host-side behavior', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('installs the renderer and mounts the assembled application', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="root-probe" />)
    const renderer = ctx.get('uiRenderer')
    expect(renderer).toBeDefined()
    const el = container()
    act(() => { mounted.push(renderer!.mount(el)) })
    expect(el.querySelector('[data-testid="root-probe"]')).toBeTruthy()
  })

  it('hydrates the boot page before switching to the assembled application', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="root-probe" />)
    const el = container()
    el.innerHTML = '<div class="boot" data-dsh-boot=""><div><div class="spinner" data-dsh-boot-spinner="" style="--dsh-boot-arc: 180deg"></div><div>Loading plugins…</div></div></div>'
    const boot = el.firstElementChild
    const observer = new MutationObserver(() => {})
    observer.observe(el, { childList: true, subtree: true })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    act(() => { mounted.push(ctx.get('uiRenderer')!.mount(el)) })

    const records = observer.takeRecords()
    observer.disconnect()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect(el.querySelector('[data-testid="root-probe"]')).toBeTruthy()
    expect(records.some(record => record.target === boot)).toBe(false)
  })

  it('returns an unmount disposer', async () => {
    const { ctx, slots } = await bench()
    slots.register({ name: 'root' }, () => <div data-testid="root-probe" />)
    const el = container()
    let unmount: () => void = () => {}
    act(() => { unmount = ctx.get('uiRenderer')!.mount(el) })
    act(() => { unmount() })
    expect(el.querySelector('[data-testid="root-probe"]')).toBeNull()
  })

  it('retracts the service and renderer with its fiber', async () => {
    const { ctx, slots, fiber } = await bench()
    await stabilize(() => fiber.dispose())
    expect(ctx.get('uiRenderer')).toBeUndefined()
    expect(() => slots.renderSlot('root', {})).toThrow('not installed')
  })
})
