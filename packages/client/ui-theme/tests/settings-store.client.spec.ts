/** Appearance and font-size row stores: snapshot-mirror actions and the revision guards. */
import { describe, expect, it } from 'vitest'
import { createAppearanceRowStore, createFontRowStore } from '../src/client/settings-store.ts'

describe('createAppearanceRowStore', () => {
  const snapshot = (preference: 'light' | 'dark' | 'system' | 'sun', revision: number) =>
    ({ preference, sunLocation: 'auto' as const, revision })

  it('init shape: sunrise and sunset preference at the automatic location with revision at -1', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toEqual({ preference: 'sun', sunLocation: 'auto', sun: undefined, revision: -1 })
  })

  it('sync mirrors the preference, location, and estimate and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync(snapshot('dark', 0))
    expect(store.getSnapshot()).toEqual({ preference: 'dark', sunLocation: 'auto', sun: undefined, revision: 0 })
    const sun = { cityId: 'beijing', source: 'manual' as const, daylight: true, interval: [1, 2] as const }
    store.actions.sync({ preference: 'sun', sunLocation: 'beijing', sun, revision: 2 })
    expect(store.getSnapshot()).toEqual({ preference: 'sun', sunLocation: 'beijing', sun, revision: 2 })
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync(snapshot('dark', 3))
    store.actions.sync(snapshot('system', 2))
    store.actions.sync(snapshot('system', 3))
    expect(store.getSnapshot().preference).toBe('dark')
    expect(store.getSnapshot().revision).toBe(3)
  })
})

describe('createFontRowStore', () => {
  it('init shape: default size with revision at -1', () => {
    const store = createFontRowStore().create()
    expect(store.getSnapshot()).toEqual({ fontSizes: { text: 14, code: 11, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1 })
  })

  it('sync mirrors the size; the revision guard drops stale and duplicate writes', () => {
    const store = createFontRowStore().create()
    const sizes = { text: 16, code: 12, terminal: 14 }
    const fonts = { text: '"Inter"', code: '', terminal: '' }
    store.actions.sync(sizes, { ...fonts }, 3)
    expect(store.getSnapshot()).toEqual({ fontSizes: sizes, fontFamilies: fonts, revision: 3 })
    store.actions.sync({ ...sizes, text: 12 }, fonts, 2)
    store.actions.sync({ ...sizes, text: 12 }, fonts, 3)
    expect(store.getSnapshot().fontSizes.text).toBe(16)
    expect(store.getSnapshot().revision).toBe(3)
  })
})
