/** Import the shipped entry so invalid module-level storage declarations fail in tests. */
import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'
import { isVolatile } from '@deepseek-ai/cosmokit'

describe('balance entry configuration', () => {
  it('loads the built-in entry with bounded refresh and history defaults', () => {
    const config = Config({})
    expect(config).toMatchObject({ historyLimit: 10080, displayLimit: 240 })
    expect(isVolatile(config.refreshSeconds) ? config.refreshSeconds.get() : config.refreshSeconds).toBe(15)
    expect(isVolatile(config.enabled) ? config.enabled.get() : config.enabled).toBe(true)
    expect(isVolatile(config.source) ? config.source.get() : config.source).toBe('api')
    expect(() => Config({ refreshSeconds: 0 })).toThrow()
    expect(() => Config({ displayLimit: 1001 })).toThrow()
  })
})
