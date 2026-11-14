// @vitest-environment jsdom
/** The main view mode reaches the whole client through `body[data-dsh-mode]`. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { CurrentModeState } from '../src/client/AgentPresetSection.tsx'
import { accentMode, installModeAccent } from '../src/client/mode-accent.ts'

type Transition = Pick<ViewTransition, 'ready' | 'updateCallbackDone' | 'finished' | 'skipTransition'>

let reducedMotion = false
let startViewTransition: ReturnType<typeof vi.fn<(update: () => void) => Transition>>

beforeEach(() => {
  reducedMotion = false
  startViewTransition = vi.fn((update: () => void) => {
    update()
    return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition: vi.fn() }
  })
  Object.assign(document, { startViewTransition })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') && reducedMotion }))
})

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
  vi.unstubAllGlobals()
  delete document.body.dataset.dshMode
})

describe('mode accent', () => {
  it('keeps the current reveal when only the conversation activity changes', () => {
    const updates: (() => void)[] = []
    startViewTransition.mockImplementation((update) => {
      updates.push(update)
      return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition: vi.fn() }
    })
    const mode = createSnapshotStore<CurrentModeState>({ id: 'standard', sessionId: 'a', blank: false, busy: false })
    const dispose = installModeAccent(mode)
    try {
      mode.set({ id: 'writing', sessionId: 'a', blank: false, busy: false })
      mode.set({ id: 'writing', sessionId: 'a', blank: false, busy: true })
      mode.set({ id: 'writing', sessionId: 'a', blank: false, busy: false })
      expect(startViewTransition).toHaveBeenCalledOnce()
      updates[0]!()
      expect(document.body.dataset.dshMode).toBe('writing')
    } finally { dispose() }
  })

  it('handles skipped native captures while retaining the newest accent', async () => {
    startViewTransition.mockImplementation((update) => {
      update()
      const ready = Promise.withResolvers<undefined>()
      return {
        ready: ready.promise, updateCallbackDone: Promise.resolve(), finished: Promise.resolve(),
        skipTransition: () => { ready.reject(new DOMException('Transition was skipped', 'AbortError')) },
      }
    })
    const mode = createSnapshotStore<CurrentModeState>({ id: 'standard', sessionId: 'a', blank: false, busy: false })
    const dispose = installModeAccent(mode)
    mode.set({ id: 'security', sessionId: 'a', blank: false, busy: false })
    mode.set({ id: 'writing', sessionId: 'a', blank: false, busy: false })
    expect(document.body.dataset.dshMode).toBe('writing')
    dispose()
    await Promise.resolve()
    expect(document.documentElement.dataset.dshModeReveal).toBeUndefined()
  })

  it('reports a failed state update and releases the reveal', async () => {
    const error = new Error('State update failed')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    startViewTransition.mockImplementation(() => ({
      ready: Promise.reject(error), updateCallbackDone: Promise.reject(error), finished: Promise.reject(error), skipTransition: vi.fn(),
    }))
    const mode = createSnapshotStore<CurrentModeState>({ id: 'standard', blank: true, busy: false })
    const dispose = installModeAccent(mode)
    try {
      mode.set({ id: 'writing', blank: true, busy: false })
      await vi.waitFor(() => { expect(document.documentElement.dataset.dshModeReveal).toBeUndefined() })
      expect(warning).toHaveBeenCalledExactlyOnceWith('Could not apply the conversation mode accent:', error)
    } finally { dispose(); warning.mockRestore() }
  })

  it('ignores delayed updates after another conversation is selected or the presenter is disposed', () => {
    const updates: (() => void)[] = []
    startViewTransition.mockImplementation((update) => {
      updates.push(update)
      return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve(), skipTransition: vi.fn() }
    })
    const mode = createSnapshotStore<CurrentModeState>({ id: 'standard', sessionId: 'a', blank: false, busy: false })
    const dispose = installModeAccent(mode)
    mode.set({ id: 'security', sessionId: 'a', blank: false, busy: false })
    mode.set({ id: 'writing', sessionId: 'b', blank: false, busy: false })
    for (const update of updates.splice(0)) update()
    expect(document.body.dataset.dshMode).toBe('writing')
    expect(document.documentElement.dataset.dshModeReveal).toBeUndefined()
    mode.set({ id: 'reverse', sessionId: 'b', blank: false, busy: false })
    dispose()
    for (const update of updates) update()
    expect(document.body.dataset.dshMode).toBeUndefined()
  })

  it('accents only the four shipped modes', () => {
    expect(['standard', 'security', 'reverse', 'writing'].map(accentMode)).toEqual(['standard', 'security', 'reverse', 'writing'])
    expect(accentMode('ptc')).toBeUndefined()
    expect(accentMode(undefined)).toBeUndefined()
  })

  it('mirrors the main view mode onto the body and clears it for other presets and on dispose', () => {
    const mode = createSnapshotStore<CurrentModeState>({ blank: true, busy: false })
    const dispose = installModeAccent(mode)
    expect(document.body.dataset.dshMode).toBeUndefined()
    mode.set({ id: 'security', sessionId: 'a', blank: false, busy: false })
    expect(document.body.dataset.dshMode).toBe('security')
    mode.set({ id: 'minimal', sessionId: 'b', blank: false, busy: false })
    expect(document.body.dataset.dshMode).toBeUndefined()
    mode.set({ id: 'writing', sessionId: 'c', blank: false, busy: false })
    dispose()
    expect(document.body.dataset.dshMode).toBeUndefined()
  })

  it('spreads a changed mode of the same conversation from the pressed control', async () => {
    const mode = createSnapshotStore<CurrentModeState>({ id: 'standard', blank: true, busy: false })
    const dispose = installModeAccent(mode)
    expect(startViewTransition).not.toHaveBeenCalled()
    document.dispatchEvent(new MouseEvent('pointerdown', { clientX: 40, clientY: 60 }))
    mode.set({ id: 'security', blank: true, busy: false })
    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(document.body.dataset.dshMode).toBe('security')
    expect(document.documentElement.style.getPropertyValue('--dsh-mode-reveal-x')).toBe('40px')
    expect(document.documentElement.dataset.dshModeReveal).toBe('')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(document.documentElement.dataset.dshModeReveal).toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('--dsh-mode-reveal-x')).toBe('')
    dispose()
  })

  it('fades instead of spreading across conversations or under reduced motion', () => {
    const mode = createSnapshotStore<CurrentModeState>({ id: 'standard', sessionId: 'a', blank: false, busy: false })
    const dispose = installModeAccent(mode)
    mode.set({ id: 'security', sessionId: 'b', blank: false, busy: false })
    reducedMotion = true
    mode.set({ id: 'writing', sessionId: 'b', blank: false, busy: false })
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(document.body.dataset.dshMode).toBe('writing')
    dispose()
  })
})
