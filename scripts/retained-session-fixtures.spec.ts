/** Released Session samples remain readable without replacing their original bytes. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('.agents/persistence/retained-session-fixtures.json', root), 'utf8')) as {
  base: string
  sha256: Record<string, string>
}

function changedFixtures(read: (path: string) => Uint8Array): string[] {
  return Object.entries(manifest.sha256).flatMap(([path, digest]) => {
    try {
      return createHash('sha256').update(read(path)).digest('hex') === digest ? [] : [path]
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [path]
      throw error
    }
  })
}

const read = (path: string): Buffer => readFileSync(fileURLToPath(new URL(path, root)))

describe('retained Session fixture bytes', () => {
  it('preserves every recorded generation from the DSHU migration baseline', () => {
    expect(changedFixtures(read), `changed records from ${manifest.base}`).toEqual([])
  })

  it('rejects replacing a retained record even when the replacement remains valid JSON', () => {
    const selected = 'scripts/snapshots/python-sdk-single-exe/advanced/session.v4.jsonl'
    expect(changedFixtures(path => path === selected ? Buffer.from('{"type":"session"}\n') : read(path)))
      .toEqual([selected])
  })

  it('rejects removing a retained browser sample', () => {
    const selected = 'apps/web/tests/fixtures/deepseek-model-label-1017/session.v4.jsonl'
    expect(changedFixtures((path) => {
      if (path === selected) throw Object.assign(new Error('Missing retained sample'), { code: 'ENOENT' })
      return read(path)
    })).toEqual([selected])
  })
})
