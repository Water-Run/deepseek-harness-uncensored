/** Owner editing and actual persistence through the Web settings surface. @module */
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'
import { expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-target-protection/settings'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

const patch = fileURLToPath(new URL('../../cli/config/examples/target-protection.yml', import.meta.url))
const cliManifest = fileURLToPath(new URL('../../cli/package.json', import.meta.url))
const picker = fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url))

it('shows configured database counts and unready SSH in expanded narrow coverage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-database-settings-'))
  try {
    const bindings = join(root, 'bindings.yml')
    const database = { name: 'fixture', hostname: 'database.invalid', database: 'fixture', username: 'fixture', passwordRef: 'FIXTURE_PASSWORD' }
    await writeFile(bindings, JSON.stringify([{ insert: [
      { id: 'sqlite-status', name: '@deepseek-ai/dsh-target-protection/sqlite', config: {
        databases: [{ name: 'fixture', path: join(root, 'fixture.sqlite') }],
      } },
      { id: 'postgres-status', name: '@deepseek-ai/dsh-target-protection/postgres', config: { databases: [database] } },
      { id: 'mysql-status', name: '@deepseek-ai/dsh-target-protection/mysql', config: { databases: [{ ...database, accountHost: '%' }] } },
    ] }]))
    const scaffold = await launchWebScaffold({ extraOverlayPath: [patch, bindings, picker], extraInstallAnchors: [cliManifest] })
    try {
      const browser = await chromium.launch()
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl)
        await openSettings(page, 'en')
        const settings = page.getByRole('dialog', { name: 'Settings' })
        await settings.getByRole('button', { name: 'Modes', exact: true }).click()
        await settings.getByRole('button', { name: 'Modes with configuration' }).click()
        await page.getByRole('menuitem', { name: /^Security/ }).click()
        const target = settings.getByRole('region', { name: 'Target protection', exact: true })
        await target.getByText('SSH and databases', { exact: true }).click()
        await target.getByText('Configured bindings · 1', { exact: true }).first().waitFor()
        expect(await target.getByText('Configured bindings · 1', { exact: true }).count()).toBe(3)
        await target.getByText('Not ready', { exact: true }).waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        expect(await target.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
})

it.skipIf(process.platform !== 'win32').each(['gateway', 'disabled'] as const)(
  'reports the mounted native %s executor in narrow Security settings', async (network) => {
    const root = await mkdtemp(join(tmpdir(), 'dshu-native-settings-'))
    try {
      const native = join(root, 'native.yml')
      await writeFile(native, `- id: target-protected-subprocess
  disabled: true
- insert:
    - id: native-settings-subprocess
      name: '@deepseek-ai/dsh-target-protection/subprocess-native'
      config:
        readonlyPaths: [${JSON.stringify(dirname(process.execPath))}]
        readwritePaths: []
        temporaryRoot: ${JSON.stringify(join(root, 'private'))}
        network: ${network}
`)
      const scaffold = await launchWebScaffold({ extraOverlayPath: [patch, native, picker], extraInstallAnchors: [cliManifest] })
      try {
        expect(scaffold.ctx.get('targetProtectedSubprocess')).toBe(network === 'gateway' ? 'native-gateway' : 'native-offline')
        const browser = await chromium.launch()
        try {
          const page = await newEnglishPage(browser)
          await page.goto(scaffold.authenticatedUrl)
          await openSettings(page, 'en')
          const settings = page.getByRole('dialog', { name: 'Settings' })
          await settings.getByRole('button', { name: 'Modes', exact: true }).click()
          await settings.getByRole('button', { name: 'Modes with configuration' }).click()
          await page.getByRole('menuitem', { name: /^Security/ }).click()
          const target = settings.getByRole('region', { name: 'Target protection', exact: true })
          await target.getByText(network === 'gateway' ? 'Native confinement · gateway' : 'Native confinement · network disabled', { exact: true }).waitFor()
          await page.setViewportSize({ width: 390, height: 844 })
          expect(await target.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        } finally { await browser.close() }
      } finally { await scaffold.close() }
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  },
)

it('saves a real production rule and fits the editor at the narrow settings width', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: [patch, picker], extraInstallAnchors: [cliManifest] })
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
      expect(await target.getByText('Mounted', { exact: true }).count()).toBe(3)
      await target.getByText('Guarded local files', { exact: true }).waitFor()
      await target.getByText('Admission checks', { exact: true }).waitFor()
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
      await target.getByRole('button', { name: 'Edit rule', exact: true }).click()
      const edit = page.getByRole('dialog', { name: 'Edit rule' })
      await edit.getByLabel('Rule name').fill('Unsubmitted database edit')
      await scaffold.ctx.targetProtection.configure({ ...saved.preferences, mainlandEnabled: true }, saved.revision)
      await expect.poll(() => page.getByText('Rule revision 3', { exact: true }).count()).toBe(1)
      expect(await edit.getByLabel('Rule name').inputValue()).toBe('Unsubmitted database edit')
      await edit.getByRole('button', { name: 'Apply to draft' }).click()
      await target.getByText('Unsubmitted database edit').waitFor()
      await target.getByText(/The rule revision changed/u).waitFor()
      expect(await target.getByRole('button', { name: 'Save rules' }).isEnabled()).toBe(false)
      await target.getByRole('button', { name: 'Discard edits' }).click()
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

it('reissues the real first-entry challenge as the optional protection changes', async () => {
  // Pin only country-data age. The reading interval uses a real monotonic clock.
  const realNow = Date.now
  const start = realNow(), validAt = Date.parse('2026-10-07T00:00:00Z')
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => validAt + realNow() - start)
  try {
    const scaffold = await launchWebScaffold({ firstUse: true, preservePresetRegistryConfig: true,
      extraOverlayPath: [patch, picker], extraInstallAnchors: [cliManifest] })
    try {
      const setMainland = async (mainlandEnabled: boolean): Promise<void> => {
        const snapshot = await scaffold.ctx.targetProtection.snapshot()
        await scaffold.ctx.targetProtection.configure({ ...snapshot.preferences, mainlandEnabled }, snapshot.revision)
      }
      await setMainland(true)
      expect(scaffold.ctx.agentPresets.securityEntryState()).toMatchObject({ required: true, protection: { state: 'enabled' } })
      const browser = await chromium.launch()
      try {
        const page = await newEnglishPage(browser)
        await page.goto(scaffold.authenticatedUrl)
        // First-use workspace preparation replaces the temporary sessionless hero.
        await page.locator('[data-conversation-session]').waitFor()
        const modePicker = page.getByRole('button', { name: 'Default', exact: true })
          .and(page.getByTitle('Choose the agent preset for your new task'))
        await modePicker.click()
        const modes = page.getByRole('menu')
        await modes.waitFor({ timeout: 5_000 })
        expect(await modes.getByRole('menuitem').allTextContents()).toContainEqual(expect.stringMatching(/Security/u))
        await modes.getByRole('menuitem', { name: /^Security/u }).click()
        const dialog = page.getByRole('dialog', { name: 'Before entering Security mode' })
        const acknowledgement = dialog.getByRole('textbox', { name: 'Acknowledgement' })
        await dialog.getByText('Enabled and available', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: /^Read and confirm/u }).waitFor()
        expect(await acknowledgement.count()).toBe(0)

        await setMainland(false)
        await dialog.getByText('Off', { exact: true }).waitFor()
        await acknowledgement.waitFor()
        expect(await acknowledgement.getAttribute('placeholder')).toBeTruthy()
        expect(scaffold.ctx.agentPresets.securityEntryState().acknowledged).toBe(false)

        await setMainland(true)
        await dialog.getByText('Enabled and available', { exact: true }).waitFor()
        await acknowledgement.waitFor({ state: 'detached' })
        await dialog.getByRole('button', { name: 'Confirm and enter Security mode' }).click()
        await dialog.waitFor({ state: 'hidden' })
        expect(scaffold.ctx.agentPresets.securityEntryState().acknowledged).toBe(true)
        await page.getByRole('button', { name: 'Security', exact: true }).waitFor()
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  } finally { clock.mockRestore() }
})
