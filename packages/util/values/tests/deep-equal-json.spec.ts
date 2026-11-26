/** JSON members with names also present on the object prototype. */
import { describe, expect, it } from 'vitest'
import { deepEqualJson } from '../src/index.ts'

describe('deepEqualJson', () => {
  it('compares own JSON fields in both directions', () => {
    const first = { ['__proto__']: {}, title: 'notes' }
    const reordered = { title: 'notes', ['__proto__']: {} }
    const renamed = { label: {}, title: 'notes' }

    expect(deepEqualJson(first, reordered)).toBe(true)
    expect(deepEqualJson(first, renamed)).toBe(false)
    expect(deepEqualJson(renamed, first)).toBe(false)
  })
})
