/** Owner editing and actual persistence through the Web settings surface. @module */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

const patch = fileURLToPath(new URL('../../cli/config/examples/target-protection.yml', import.meta.url))
const cliManifest = fileURLToPath(new URL('../../cli/package.json', import.meta.url))

it('saves a real production rule and fits the editor at the narrow settings width', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: patch, extraInstallAnchors: [cliManifest] })
  try {
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser)
      await page.goto(scaffold.authenticatedUrl)
      await openSettings(page, 'en')
      const settings = page.getByRole('dialog', { name: 'Settings' })
      await settings.getByRole('button', { name: 'Modes', exact: true }).click()
      const target = settings.getByRole('region', { name: 'Target protection', exact: true })
      if (!await target.isVisible()) {
        await settings.getByRole('button', { name: 'Modes with configuration' }).click()
        await page.getByRole('menuitem', { name: /^Security/ }).click()
      }
      await target.getByText('Rule revision 1').waitFor()
      expect(await target.getByRole('button', { name: 'Check for update' }).isEnabled()).toBe(true)
      await page.setViewportSize({ width: 390, height: 844 })
      expect(await target.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await target.getByRole('button', { name: 'Add rule' }).click()
      const editor = page.getByRole('dialog', { name: 'Add rule' })
      await editor.getByLabel('Rule name').fill('Production database')
      await editor.getByRole('button', { name: 'Resource' }).click()
      await page.getByRole('menuitem', { name: 'Database', exact: true }).click()
      await editor.getByLabel('Address or pattern').fill('db.example.test')
      await editor.getByLabel('Port (optional)').fill('5432')
      await editor.getByLabel('Database name (optional)').fill('production')
      await editor.getByRole('button', { name: 'Apply to draft' }).click()
      expect((await scaffold.ctx.targetProtection.snapshot()).revision).toBe(1)
      await target.getByRole('button', { name: 'Save rules' }).click()
      await target.getByText('Rules saved').waitFor()
      const saved = await scaffold.ctx.targetProtection.snapshot()
      expect(saved.revision).toBe(2)
      expect(saved.preferences.rules).toMatchObject([{
        name: 'Production database', kind: 'database', environment: 'production', protection: 'full',
        match: 'host', address: 'db.example.test', port: 5432, database: 'production',
      }])
      const initiator = await scaffold.ctx.agents.create({ sessionId: SessionId('target-audit-web-fixture') })
      await scaffold.ctx.agents.withInitiator(initiator.agent, () =>
        scaffold.ctx.targetProtection.checkConnection('db.example.test', 5432, undefined, 'endpoint', 'mutate',
          new AbortController().signal, 'production'))
      const audit = settings.getByRole('region', { name: 'Admission audit', exact: true })
      await audit.getByRole('button', { name: 'View audit records' }).click()
      await audit.getByText('Fully protected target').first().waitFor()
      expect(await audit.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      expect(await audit.textContent()).not.toContain('db.example.test')
      const refusal = audit.getByRole('listitem').filter({ hasText: 'Fully protected target' }).first()
      await refusal.getByRole('button', { name: 'Decision details' }).click()
      const recorded = scaffold.ctx.targetProtection.auditHistory().entries.find(entry => entry.code === 'TARGET_FULLY_PROTECTED')
      if (recorded?.fingerprint == null) throw new Error('Missing persisted production refusal')
      await audit.getByText(recorded.fingerprint, { exact: true }).waitFor()
      await audit.getByText(initiator.agent.id, { exact: true }).waitFor()
      expect(await audit.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
