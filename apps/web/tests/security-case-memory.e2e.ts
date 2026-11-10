/** Saving a reviewed Security case note through the shipped Web composition. @module */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {} from '@deepseek-ai/dsh-memory'
import { SessionId } from '@deepseek-ai/dsh-session'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

const picker = fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url))

it('stores only the reviewed note and retrieves it for another Security conversation in the same workspace', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: picker })
  try {
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd, 'Case workspace')
    const directory = join(scaffold.workspaceCwd, '.security', 'acme')
    await mkdir(directory, { recursive: true })
    const ledger = join(directory, 'case.json')
    const date = '2026-11-10T00:00:00Z'
    const original = JSON.stringify({ version: 1, kind: 'security', slug: 'acme', objective: 'Assess fixture',
      createdAt: date, updatedAt: date, targets: [], evidence: [], findings: [],
      notes: [{ id: 'N-0001', title: 'Timeline', body: 'Original fixture timeline', addedAt: date }],
    })
    await writeFile(ledger, original)
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(scaffold.authenticatedUrl)
      await openSettings(page, 'en')
      const settings = page.getByRole('dialog', { name: 'Settings' })
      await settings.getByRole('button', { name: 'Modes', exact: true }).click()
      await settings.getByRole('button', { name: 'Modes with configuration' }).click()
      await page.getByRole('menuitem', { name: /^Security/ }).click()
      await settings.getByRole('button', { name: /Assess fixture/ }).click()
      await page.getByRole('button', { name: 'Save to memory N-0001' }).click()
      const manager = page.getByRole('dialog', { name: 'Cross-conversation memory' })
      const content = manager.locator('textarea')
      expect(await content.inputValue()).toBe('Original fixture timeline')
      expect(scaffold.ctx.memory.list()).toEqual([])
      const reviewed = 'Reviewed fixture timeline'
      await content.fill(reviewed)
      await manager.getByRole('button', { name: 'Save', exact: true }).click()
      await manager.getByText(reviewed, { exact: true }).waitFor()
      const workspaceKey = `workspace:${workspace.id}`
      expect(scaffold.ctx.memory.list()).toMatchObject([{ title: 'acme · Timeline', content: reviewed,
        topic: 'case:acme:note:N-0001', scope: { global: false, workspace: workspaceKey, mode: 'security' } }])
      const scope = { sessionId: SessionId('another-security-conversation'), workspaceKeys: [workspaceKey],
        mode: 'security', freshChild: false }
      const retrieve = (value: typeof scope) => scaffold.ctx.memory.retrieve({ query: 'fixture timeline', scope: value }).selection.entries
      expect(retrieve(scope)).toHaveLength(1)
      expect(retrieve({ ...scope, mode: 'writing' })).toEqual([])
      expect(retrieve({ ...scope, workspaceKeys: ['workspace:other'] })).toEqual([])
      expect(await readFile(ledger, 'utf8')).toBe(original)
      expect(await manager.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
