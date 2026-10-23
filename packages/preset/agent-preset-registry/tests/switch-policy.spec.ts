/** Mandatory reading duration, one-time acknowledgement and restart-reset permission. */
import { expect, it } from 'vitest'
import { ModeSwitchPermission } from '../src/switch-policy.ts'

it('requires a full monotonic reading interval and consumes the exact acknowledgement once', () => {
  let now = 100
  const permission = new ModeSwitchPermission(() => now)
  const challenge = permission.begin()
  expect(permission.read().allowExistingSessionSwitch).toBe(false)
  now += challenge.waitMs - 1
  expect(() => permission.confirm(challenge.id)).toThrow()
  expect(permission.read().allowExistingSessionSwitch).toBe(false)
  now++
  expect(permission.confirm(challenge.id).allowExistingSessionSwitch).toBe(true)
  expect(() => permission.confirm(challenge.id)).toThrow()
  expect(new ModeSwitchPermission(() => now).read().allowExistingSessionSwitch).toBe(false)
})

it('revokes replaced, disabled and expired acknowledgements', () => {
  let now = 0
  const permission = new ModeSwitchPermission(() => now)
  const first = permission.begin(), second = permission.begin()
  now = 10000
  expect(() => permission.confirm(first.id)).toThrow()
  permission.disable()
  expect(() => permission.confirm(second.id)).toThrow()
  const expired = permission.begin()
  now += 300001
  expect(() => permission.confirm(expired.id)).toThrow()
  expect(permission.read().allowExistingSessionSwitch).toBe(false)
})
