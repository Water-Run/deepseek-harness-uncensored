/**
 * ui-commands browser half on a real cordis Context with fake slash/slots
 * faces and real session scopes: the plugin body mounts CommandUiRuntime as
 * `command`, the popupSelect shell registers into conversation.input.overlay
 * through slot declaration injection with a per-session inject (sessionId →
 * scope → popupFor; unknown id fails loud), both fold up on fiber disposal
 * (HMR safety), and the service satisfies the frozen CommandUiContract.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { TestSessions } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { CommandUiContract } from '../src/client/contract.ts'
import type { PopupSelectInjected } from '../src/client/PopupSelectView.tsx'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, CommandUiRuntime, inject } from '../src/client/index.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SidebarRightOpenTab, TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import { asideAddress } from '../src/client/asides/address.ts'
import type {} from '../src/client/asides/index.ts'

const sid = (k: string): SessionId => k as SessionId

async function bench() {
  const ctx = new Context()
  const sources = new Map<string, InputTriggerSource>()
  ctx.provide('inputTriggers', {
    registerSource(src: InputTriggerSource) {
      sources.set(`${src.trigger} ${src.name}`, src)
      return () => { sources.delete(`${src.trigger} ${src.name}`) }
    },
  })
  const sessions = new TestSessions(async (action) => { await action() }, ctx)
  onTestFinished(async () => {
    await sessions.disposeScopes()
    await ctx.fiber.dispose()
  })
  ctx.provide('sessions', sessions)
  await sessions.add({ id: 's1' })
  await sessions.add({ id: 'child' })
  sessions.retainFor(ctx, sid('s1'))
  sessions.retainFor(ctx, { parentSessionId: sid('parent'), childSessionId: sid('child'), mode: 'continuable' })
  const commandsRemote = { list: () => Promise.resolve({ ok: true as const, value: [] }) }
  // The service subscribes its cache-invalidation events on construction, so
  // the Remote face needs `$on` even where this spec dispatches none.
  ctx.provide('remote', { commands: commandsRemote, $on: () => () => {} })
  ctx.provide('remote.commands', commandsRemote)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root', children: { 'conversation.input.overlay': { kind: 'list', scope: 'session' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const mint = (key: string) => {
    const id = sid(key)
    const binding = sessions.binding(id) ?? sessions.retainFor(ctx, id).binding
    return { ctx: binding.ctx, fiber: binding.ctx.fiber }
  }
  return { ctx, fiber, sources, slots: ctx.slots, mint, sessions }
}

describe('apply', () => {
  it('offers /clear only in the side, replaces its retained resource, and reacts only to actual tab closure', async () => {
    const { ctx, sources, sessions, fiber } = await bench()
    await sessions.add({ id: 'side-one' })
    await sessions.add({ id: 'side-two' })
    await sessions.add({ id: 'side-three' })
    let child = sid('side-one')
    let cleared = 0
    const aside = vi.fn(async () => ({ ok: true as const, value: { sessionId: child } }))
    const resetAside = vi.fn(async (request: { sessionId: SessionId; cause: string }) => {
      if (request.cause === 'manual') child = sid(++cleared === 1 ? 'side-two' : 'side-three')
      return { ok: true as const, value: { sessionId: child } }
    })
    const remote = { aside, resetAside }
    Object.assign(ctx.remote, { session: remote })
    ctx.provide('remote.session', remote)
    let provider: ResourceProvider<'aside'> | undefined
    ctx.provide('resources', { register: (value: ResourceProvider<'aside'>) => { provider = value; return () => {} } })
    ctx.provide('sidebarRightTabs', { register: () => () => {} })
    const tabs = createSnapshotStore<readonly SidebarRightOpenTab[]>([])
    ctx.provide('sidebarRight', { mounted: { getSnapshot: () => sid('s1') }, openTabs: tabs })
    await Promise.all([...ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(value => value.await())))
    if (provider === undefined) throw new Error('Missing side provider')
    const abort = new AbortController()
    const stream = provider.open(asideAddress(sid('s1')), { signal: abort.signal })[Symbol.asyncIterator]()
    try {
      expect((await stream.next()).value).toMatchObject({ ok: true, value: { reference: { sessionId: 'side-one' } } })
      const source = sources.get('/ command')!
      const request = { query: '', position: 'leading' as const, drilled: false, signal: new AbortController().signal }
      expect((await source.candidates({ sessionId: sid('s1') }, request)).some(value => value.name === 'clear')).toBe(false)
      expect((await source.candidates({ sessionId: sid('side-one') }, request)).some(value => value.name === 'clear')).toBe(true)
      const match = await source.matchEnter!({ sessionId: sid('side-one') }, '/clear', new AbortController().signal, { attachments: 0 })
      expect(match).toBe('handled')
      expect((await stream.next()).value).toMatchObject({ ok: true, value: { reference: { sessionId: 'side-two' } } })
      aside.mockRejectedValueOnce(new Error('reconnect failed'))
      expect(await source.matchEnter!({ sessionId: sid('side-two') }, '/clear', new AbortController().signal, { attachments: 0 })).toBe('handled')
      expect((await stream.next()).value).toMatchObject({ ok: false })
      expect(sessions.retainInfo(sid('side-one')).getSnapshot().referenceCount).toBe(0)
      expect(sessions.retainInfo(sid('side-two')).getSnapshot().referenceCount).toBe(1)
      const tab = { sessionId: sid('s1'), tabId: 'side-tab' as TabId, kind: 'aside', contentId: asideAddress(sid('s1')) }
      tabs.set([tab]); tabs.set([])
      await vi.waitFor(() => { expect(resetAside).toHaveBeenCalledWith({ sessionId: sid('side-three'), cause: 'close' }) })
      expect(resetAside).toHaveBeenCalledTimes(3)
      abort.abort()
      await stream.next()
      expect(resetAside).toHaveBeenCalledTimes(3)
      expect(sessions.retainInfo(sid('side-two')).getSnapshot().referenceCount).toBe(0)
      await fiber.dispose()
      tabs.set([tab]); tabs.set([])
      expect(resetAside).toHaveBeenCalledTimes(3)
    } finally { abort.abort(); await stream.return?.() }
  })

  it('sends text or images to the independent child and opens without sending when empty', async () => {
    const { ctx, sources, sessions } = await bench()
    const prompt = vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } }))
    await sessions.add({ id: 'side-question', session: { prompt } })
    const aside = vi.fn(async () => ({ ok: true as const, value: { sessionId: sid('side-question') } }))
    Object.assign(ctx.remote, { session: { aside } })
    ctx.provide('remote.session', { aside })
    ctx.provide('resources', { register: vi.fn(() => () => {}) })
    ctx.provide('sidebarRightTabs', { register: vi.fn(() => () => {}) })
    const openTab = vi.fn()
    ctx.provide('sidebarRight', { openTab, mounted: { getSnapshot: () => sid('s1') },
      openTabs: { getSnapshot: () => [], subscribe: () => () => {} } })
    await Promise.all([...ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(child => child.await())))
    const source = sources.get('/ command')!
    const match = await source.matchEnter!({ sessionId: sid('s1') }, '/side 现在情况如何', new AbortController().signal, { attachments: 0 })
    if (match === undefined || match === 'handled' || !('claim' in match)) throw new Error('side must claim its input')
    expect(await match.claim.submit('现在情况如何', ctx, [])).toEqual({ kind: 'success' })
    expect(openTab).toHaveBeenCalledWith('aside')
    expect(aside).toHaveBeenCalledWith({ sessionId: sid('s1'), kind: 'side' })
    expect(prompt).toHaveBeenCalledExactlyOnceWith([{ type: 'text', text: '现在情况如何' }], 'queue')
    expect(await match.claim.submit('', ctx, [])).toEqual({ kind: 'success' })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(await source.matchEnter!({ sessionId: sid('s1') }, '/side', new AbortController().signal, { attachments: 0 })).toBe('handled')
    expect(prompt).toHaveBeenCalledTimes(1)
    const image = { type: 'image', mediaType: 'image/png', data: 'AA==' } as const
    const imageMatch = await source.matchEnter!({ sessionId: sid('s1') }, '/side', new AbortController().signal, { attachments: 1 })
    if (imageMatch === undefined || imageMatch === 'handled' || !('claim' in imageMatch)) throw new Error('side must claim an image-only draft')
    expect(imageMatch.claim.attachments).toBe(true)
    expect(await imageMatch.claim.submit('', ctx, [image])).toEqual({ kind: 'success' })
    expect(prompt).toHaveBeenLastCalledWith([image], 'queue')
    expect((await imageMatch.claim.submit('file', ctx, [{ type: 'file', receiptId: 'parent-owned' }])).kind).toBe('error')
    expect(prompt).toHaveBeenCalledTimes(2)
    expect(sessions.retainInfo(sid('side-question')).getSnapshot().referenceCount).toBe(0)
    prompt.mockRejectedValueOnce(new Error('connection lost'))
    expect((await match.claim.submit('保留这条草稿', ctx, [])).kind).toBe('error')
    expect(sessions.retainInfo(sid('side-question')).getSnapshot().referenceCount).toBe(0)
  })
  it('admits a native btw question only to its fresh child and rejects the empty form', async () => {
    const { ctx, sources, fiber, sessions } = await bench()
    const childPrompt = vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } }))
    await sessions.add({ id: 'question', session: { prompt: childPrompt } })
    const sessionRemote = { aside: vi.fn(async () => ({ ok: true as const, value: { sessionId: sid('question') } })) }
    Object.assign(ctx.remote, { session: sessionRemote })
    ctx.provide('remote.session', sessionRemote)
    ctx.provide('resources', { register: vi.fn(() => () => {}) })
    ctx.provide('sidebarRightTabs', { register: vi.fn(() => () => {}) })
    ctx.provide('sidebarRight', { mounted: { getSnapshot: () => sid('s1') },
      openTabs: { getSnapshot: () => [], subscribe: () => () => {} } })
    await Promise.all([...ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(child => child.await())))
    const source = sources.get('/ command')!
    const match = await source.matchEnter!({ sessionId: sid('s1') }, '/btw', new AbortController().signal, { attachments: 0 })
    if (match === undefined || match === 'handled' || !('claim' in match)) throw new Error('btw must claim its input')
    expect((await match.claim.submit('', ctx, [])).kind).toBe('error')
    expect(sessionRemote.aside).not.toHaveBeenCalled()
    expect(await match.claim.submit('独立问题', ctx, [])).toEqual({ kind: 'success' })
    expect(sessionRemote.aside).toHaveBeenCalledOnce()
    expect(sessionRemote.aside).toHaveBeenCalledWith({ sessionId: sid('s1'), kind: 'btw' })
    expect(childPrompt).toHaveBeenCalledWith([{ type: 'text', text: '独立问题' }], 'queue')
    await fiber.dispose()
    expect(sessions.retainInfo(sid('question')).getSnapshot().referenceCount).toBe(0)
  })

  it('registers native side and btw commands when the built-in sidebar and resource services arrive', async () => {
    const { ctx, sources, fiber } = await bench()
    ctx.provide('remote.session', { aside: vi.fn() })
    ctx.provide('resources', { register: vi.fn(() => () => {}) })
    ctx.provide('sidebarRightTabs', { register: vi.fn(() => () => {}) })
    ctx.provide('sidebarRight', { openResource: vi.fn(), mounted: { getSnapshot: () => sid('s1') },
      openTabs: { getSnapshot: () => [], subscribe: () => () => {} } })
    await Promise.all([...ctx.registry.values()].flatMap(runtime => [...runtime.fibers].map(child => child.await())))
    const source = sources.get('/ command')!
    const rows = await source.candidates({ sessionId: sid('s1') }, { query: '', position: 'leading', drilled: false, signal: new AbortController().signal })
    expect(rows.map(row => row.name)).toEqual(expect.arrayContaining(['side', 'btw']))
    await fiber.dispose()
    expect(sources.size).toBe(0)
  })
  it('declares the services it binds', () => {
    expect(inject).toEqual(['inputTriggers', 'sessions', 'remote', 'remote.commands', 'locale'])
  })

  it('mounts ctx.commandUi, registers the source and the overlay entry, and folds up on disposal', async () => {
    const { ctx, fiber, sources, slots } = await bench()
    const command = ctx.get('commandUi')
    expect(command).toBeInstanceOf(CommandUiRuntime)
    // Frozen-contract conformance (compile-time check rides the assignment).
    const contract: CommandUiContract = command as CommandUiRuntime
    expect(typeof contract.register).toBe('function')
    expect(typeof contract.popupFor).toBe('function')
    expect([...sources.keys()]).toEqual(['/ command'])
    expect(slots.entries('conversation.input.overlay').map(entry => entry.options.id)).toEqual(['command-popup'])
    await fiber.dispose()
    expect(sources.size).toBe(0)
    expect(slots.entries('conversation.input.overlay')).toHaveLength(0)
  })

  it('provides no File action without its composer owner', async () => {
    const { fiber, sources } = await bench()
    onTestFinished(() => fiber.dispose())
    const source = sources.get('/ command')!
    const req = { query: '', position: 'leading' as const, drilled: false, signal: new AbortController().signal }
    expect(await source.candidates({ sessionId: sid('s1') }, req)).toEqual([])
    expect(await source.candidates({ sessionId: sid('child') }, req)).toEqual([])
  })

  it('the overlay inject resolves the per-session popup controller by sessionId and fails loud on an unknown id', async () => {
    const { ctx, slots, mint } = await bench()
    const command = ctx.get('commandUi') as CommandUiRuntime
    const scope = mint('s1')
    const entry = slots.entries('conversation.input.overlay')[0]!
    const injectEntry = entry.inject as unknown as (sessionId: SessionId) => PopupSelectInjected
    expect(injectEntry(sid('s1')).popup).toBe(command.popupFor(scope.ctx))
    expect(() => injectEntry(sid('ghost'))).toThrow(/resolved no scope/)
  })
})
