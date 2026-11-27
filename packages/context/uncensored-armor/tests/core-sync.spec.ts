import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CORE_EN } from '../src/core/en.ts'
import { CORE_ZH } from '../src/core/zh.ts'
import { BOOST_EN } from '../src/boost/en.ts'
import { BOOST_ZH } from '../src/boost/zh.ts'

const packageRoot = join(import.meta.dirname, '..')

/** One generated fragment: its id in the lock and the text the model receives. */
const FRAGMENTS = [
  { id: 'CORE_EN', text: CORE_EN },
  { id: 'CORE_ZH', text: CORE_ZH },
  { id: 'BOOST_EN', text: BOOST_EN },
  { id: 'BOOST_ZH', text: BOOST_ZH },
] as const

/** SHA-256 of one fragment, matching `scripts/sync-armor-core.mjs`. */
function digest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

describe('armor core lock', () => {
  const lock = JSON.parse(readFileSync(join(packageRoot, 'armor-core.lock.json'), 'utf8')) as {
    repository: string
    tag: string
    license: string
    fragments: Record<string, string>
  }

  it('pins the community release this build ports from', () => {
    expect(lock.repository).toBe('https://github.com/kingcharleslzy-ai/dsh-purge')
    expect(lock.tag).toBe('v1.7.20')
    expect(lock.license).toBe('MIT')
  })

  it('records a digest for every fragment', () => {
    for (const fragment of FRAGMENTS) {
      expect(lock.fragments[fragment.id], fragment.id).toMatch(/^[a-f0-9]{64}$/u)
    }
  })

  it('matches the committed fragments', () => {
    for (const fragment of FRAGMENTS) {
      expect(digest(fragment.text), fragment.id).toBe(lock.fragments[fragment.id])
    }
  })
})
