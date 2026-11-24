import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { canClearSide } from '../src/client/asides/read-status.ts'

it('only offers a clear while the side generation holds a prompt', () => {
  const side = SessionId('side-one')
  expect(canClearSide(side, true)).toBe(true)
  expect(canClearSide(side, false)).toBe(false)
  expect(canClearSide(side, undefined)).toBe(false)
  expect(canClearSide(undefined, true)).toBe(false)
})
