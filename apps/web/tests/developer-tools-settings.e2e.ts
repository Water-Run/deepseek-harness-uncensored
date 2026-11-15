/** Coding view preferences preserve the four DSHU modes and explicitly installed custom modes. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { connectFreshWorkspace, openSettings, newConversationReplayPage } from './support.ts'

it('persists coding view visibility without hiding DSHU modes or changing the selected custom mode', async () => {
  const scaffold = await launchWebScaffold({
    agentPresets: { default: 'standard', definitions: [{ id: 'custom', name: 'Custom mode', plugins: [] }] },
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newConversationReplayPage(browser)
  const tripwire = watchConsole(page)
  const livePresets = async () => (await scaffold.ctx.sessionController.list({}, new AbortController().signal))
    .items.map(item => item.projections?.values.agentPreset)
  await page.goto(scaffold.authenticatedUrl)
  await openSettings(page, 'en')
  const toggle = page.getByRole('switch', { name: 'Show coding view' })
  expect(await toggle.getAttribute('aria-checked')).toBe('true')
  expect(await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')).not.toMatch(/id: ui-settings(?:\r?\n|$)/)
  await toggle.click()
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
  expect(await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'cordis.patch.yml'), 'utf8')).toContain('enabled: false')
  await page.reload()
  await openSettings(page, 'en')
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')

  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('button', { name: 'Modes', exact: true }).click()
  const visiblePresets = () => settings.locator('[data-agent-preset-id]').evaluateAll(cards => cards.map(card => card.getAttribute('data-agent-preset-id')))
  const expected = ['standard', 'security', 'reverse', 'writing', 'custom']
  await expect.poll(visiblePresets).toEqual(expected)
  expect(await settings.getByRole('button', { name: 'Let the agent help me create a preset', exact: true }).count()).toBe(0)
  await scaffold.ctx.settings.update('ui-settings', { enabled: true })
  await expect.poll(visiblePresets).toEqual(expected)
  await scaffold.ctx.settings.update('ui-settings', { enabled: false })
  await expect.poll(visiblePresets).toEqual(expected)
  expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')
  await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
  await expect.poll(livePresets).toEqual(['standard'])

  const menu = page.getByRole('menu')
  await page.getByRole('button', { name: 'Default', exact: true }).click()
  await expect.poll(() => menu.getByRole('menuitem').count()).toBe(expected.length)
  expect(await menu.getByRole('menuitem', { name: /^PTC mode|^Minimal mode|^Creator mode/ }).count()).toBe(0)
  await menu.getByRole('menuitem', { name: /^Custom mode/ }).click()
  await expect.poll(livePresets).toEqual(['custom'])
  await scaffold.ctx.settings.update('ui-settings', { enabled: true })
  await expect.poll(livePresets).toEqual(['custom'])
  await scaffold.ctx.settings.update('ui-settings', { enabled: false })
  await expect.poll(livePresets).toEqual(['custom'])
  expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')

  await page.reload()
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor()
  await page.getByRole('button', { name: 'Custom mode', exact: true }).click()
  await expect.poll(() => menu.getByRole('menuitem').count()).toBe(expected.length)
  await menu.getByRole('menuitem', { name: /^Default/ }).click()
  await expect.poll(livePresets).toEqual(['standard'])
  await openSettings(page, 'en')
  await settings.getByRole('button', { name: 'General', exact: true }).click()
  await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
  await settings.getByRole('button', { name: 'Modes', exact: true }).click()
  await expect.poll(visiblePresets).toEqual(expected)
  expect(tripwire.pageErrors).toEqual([])
})
