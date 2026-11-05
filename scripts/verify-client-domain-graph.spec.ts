import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, onTestFinished } from 'vitest'
import { resolveClientImport, verifyClientDomainGraph } from './verify-client-domain-graph.ts'

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'client-domain-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, 'packages/client/ui-fixture/src/client', name)
    mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, source)
  }
  return root
}

describe('client domain import resolution', () => {
  it('preserves imports that leave src/client from a top-level file', () => {
    expect(resolveClientImport('styles.ts', '../styles/base.css?inline'))
      .toBe('../styles/base.css?inline')
  })

  it('normalizes imports between domains inside src/client', () => {
    expect(resolveClientImport('input/hub.ts', '../queue/store.ts'))
      .toBe('queue/store.ts')
  })
})

it('allows images, shared files, contracts and assembly without treating example text as imports', () => {
  const root = fixture({
    'index.ts': "import {x} from './second/data.ts'",
    'first/body.ts': "import image from '../assets/icon.svg'; import sprite from '../assets/icon.svg#symbol'; import webp from '../assets/image.webp?url'; import type {X} from '../contract/types.ts'; import {shared} from '../shared.ts'; const example = `from '../second/data.ts'`; // from '../second/comment.ts'\n",
    'first/data.ts': "export {value} from './body.ts'",
    'shared.ts': 'export const shared = 1',
  })
  expect(verifyClientDomainGraph(root)).toEqual([])
})

it.each([
  "import {value} from '../second/value.ts'",
  "import type {Value} from '../second/value.ts'",
  "type Value = import('../second/value.ts').Value",
  "import value = require('../second/value.ts')",
  "/** @import { Value } from '../second/value.ts' */\nexport const value = 1",
  "export {value} from '../second/value.ts'",
  "import '../second/value.ts'",
  "void import('../second/value.ts')",
  "require('../second/value.ts')",
  "import css from '../second/styles.module.css'",
  "import icon from '../second/icon.svg?react'",
  "import {code} from '../assets/code.ts'",
])('rejects a cross-domain implementation dependency: %s', (source) => {
  const root = fixture({ 'first/body.ts': source })
  expect(verifyClientDomainGraph(root)).toHaveLength(1)
})
