/** Web provider selection in the shipped optional target protection overlay. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { composeEntries, loadOverlayPatches, loadProfile } from '@deepseek-ai/dsh-app-boot'

const installAnchor = fileURLToPath(new URL('../../../../package.json', import.meta.url))
const overlayPath = fileURLToPath(new URL('../../../../config/examples/target-protection.yml', import.meta.url))

it('uses guarded local fetching exclusively for the bundled Web providers under target protection', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-target-protection-web-'))
  onTestFinished(() => rmSync(home, { recursive: true, force: true }))
  const profile = loadProfile('dsh', 'web', installAnchor, home)
  const base = [...profile.layers.map(layer => layer.patches), profile.patches]
  const warnings: string[] = []
  const original = composeEntries(base)
  const protectedRows = composeEntries([
    ...base, loadOverlayPatches('dsh', overlayPath),
  ], message => warnings.push(message))

  for (const id of ['web-search-deepseek', 'web-deepseek-api', 'web-fetch-http']) {
    const ordinary = original.find(row => row.id === id)
    expect(ordinary, id).toBeDefined()
    expect(ordinary?.disabled, id).toBeUndefined()
    expect(protectedRows.find(row => row.id === id), id).toMatchObject({ disabled: true })
  }
  expect(protectedRows.find(row => row.id === 'web')?.config).toEqual({ fetchProvider: 'http' })
  expect(protectedRows.find(row => row.id === 'target-protected-http')).toEqual({
    id: 'target-protected-http', name: '@deepseek-ai/dsh-target-protection/http',
  })
  expect(warnings).toEqual([])
})
