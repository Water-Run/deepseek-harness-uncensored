// @vitest-environment jsdom
/** The main view mode reaches the whole client through `body[data-dsh-mode]`. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { CurrentModeState } from '../src/client/AgentPresetSection.tsx'
import { accentMode, installModeAccent } from '../src/client/mode-accent.ts'

type Transition = { finished: Promise<void>; skipTransition: () => void }

let reducedMotion = false
let startViewTransition: ReturnType<typeof vi.fn<(update: () => void) => Transition>>

beforeEach(() => {
  reducedMotion = false
  startViewTransition = vi.fn((update: () => void) => {
    update()
    return { finished: Promise.resolve(), skipTransition: vi.fn() }
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
