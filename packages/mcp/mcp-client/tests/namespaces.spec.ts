/** Reservations belong to applications and survive stale repeated disposal safely. @module */
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { reserveServerName } from '../src/namespaces.ts'

it('owns registries per application and never releases a replacement through an old disposer', async () => {
  const first = new Context(), second = new Context()
  try {
    const old = reserveServerName(first, 'same')
    const independent = reserveServerName(second, 'same')
    expect(first.get('mcpNamespaces')).not.toBe(second.get('mcpNamespaces'))
    expect(() => reserveServerName(first, 'same')).toThrow('already in use')
    old()
    const replacement = reserveServerName(first, 'same')
    old()
    expect(() => reserveServerName(first, 'same')).toThrow('already in use')
    replacement(); independent()
    await first.fiber.dispose()
    expect(first.get('mcpNamespaces')).toBeUndefined()
    expect(second.get('mcpNamespaces')).toBeDefined()
  } finally { await first.fiber.dispose(); await second.fiber.dispose() }
})
