import { expect, it } from 'vitest'
import { parseDesktopSessionItems } from '../src/session-menu.ts'

it('accepts bounded session names and rejects malformed or repeated identities', () => {
  expect(parseDesktopSessionItems([{ sessionId: 'one', title: 'A & B' }])).toEqual([{ sessionId: 'one', title: 'A & B' }])
  for (const value of [null, {}, [{ sessionId: '', title: 'x' }], [{ sessionId: 'x', title: 1 }],
    [{ sessionId: 'x', title: 'a'.repeat(201) }], Array.from({ length: 51 }, (_, i) => ({ sessionId: String(i), title: '' })),
    [{ sessionId: 'x', title: '' }, { sessionId: 'x', title: '' }]]) {
    expect(() => parseDesktopSessionItems(value)).toThrow()
  }
})
