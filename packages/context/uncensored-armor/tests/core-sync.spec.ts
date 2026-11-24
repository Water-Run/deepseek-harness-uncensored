import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageRoot = join(import.meta.dirname, '..')

/** One generated fragment: its module and exported constant. */
const FRAGMENTS = [
  { id: 'CORE_EN', file: 'src/core/en.ts', name: 'CORE_EN' },
  { id: 'CORE_ZH', file: 'src/core/zh.ts', name: 'CORE_ZH' },
  { id: 'BOOST_EN', file: 'src/boost/en.ts', name: 'BOOST_EN' },
  { id: 'BOOST_ZH', file: 'src/boost/zh.ts', name: 'BOOST_ZH' },
] as const

/** Read the template literal a module exports under a constant name. */
function fragmentText(file: string, name: string): string {
  const source = readFileSync(join(packageRoot, file), 'utf8')
  const at = source.indexOf(`export const ${name} = `)
  expect(at, `${file} exports ${name}`).toBeGreaterThanOrEqual(0)
  const open = source.indexOf('`', at)
  return source.slice(open + 1, source.indexOf('`', open + 1))
}

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
      expect(digest(fragmentText(fragment.file, fragment.name)), fragment.id).toBe(lock.fragments[fragment.id])
    }
  })
})
