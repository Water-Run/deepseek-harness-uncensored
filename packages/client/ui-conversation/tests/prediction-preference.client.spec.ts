// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { PredictionPreference } from '../src/client/prediction-preference.ts'

const key = 'dsh.uncensored.prediction'
const original = localStorage.getItem(key)
const instances: PredictionPreference[] = []
const create = () => { const value = new PredictionPreference(); instances.push(value); return value }
afterEach(() => {
  for (const instance of instances.splice(0)) instance.dispose()
  vi.restoreAllMocks()
  if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original)
})

it('defaults on while preserving a saved off preference across instances', () => {
  localStorage.removeItem(key)
  const first = create()
  expect(first.state.getSnapshot()).toEqual({ enabled: true, failed: false })
  expect(first.save(false)).toBe(true)
  expect(create().state.getSnapshot()).toEqual({ enabled: false, failed: false })
})

it('updates live composers and Settings together and releases its event listeners', () => {
  localStorage.setItem(key, '1')
  const first = create(), second = create()
  first.save(false)
  expect(second.state.getSnapshot().enabled).toBe(false)
  first.dispose()
  second.save(true)
  expect(first.state.getSnapshot().enabled).toBe(false)
  expect(second.state.getSnapshot().enabled).toBe(true)
})

it('stops local predictions when disabling cannot be persisted and reports the failure', () => {
  localStorage.setItem(key, '1')
  const preference = create()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
  expect(preference.save(false)).toBe(false)
  expect(preference.state.getSnapshot()).toEqual({ enabled: false, failed: true })
})
