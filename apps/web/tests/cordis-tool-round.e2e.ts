/** Historical generated-plugin cards remain readable after their tool APIs are removed. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type {} from '@deepseek-ai/dsh-cordis-host-runner'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, readPersistedEvents, parseSeedFixture, realizeSeedFixture,
  watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { expandOwningTurnProcess, newEnglishPage, saveFailureShot } from './support.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/cordis-tool-round/session.v3.jsonl', import.meta.url))
const UI_EXPECTED = fileURLToPath(new URL('./expected/cordis-history/ui.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'cordis-history'

describe.skipIf(MODE === 'record')('web e2e: historical Cordis cards', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('[role="treeitem"]').first().click()
    await page.locator('[role="treeitem"]').nth(1).click()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders recorded definition source and lifecycle results without registering retired tools', async () => {
    const persisted = await readPersistedEvents(scaffold, SessionId(SEED_ID))
    const expected = parseSeedFixture(realizeSeedFixture(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID)).events
    const tools = (events: typeof persisted) => events.filter(event => event.type === 'tool/call' || event.type === 'tool/result')
      .map(event => ({ type: event.type, data: event.data }))
    expect(tools(persisted)).toEqual(tools(expected))
    const names = scaffold.ctx.tools.schemas().map(tool => tool.name)
    expect(names).not.toEqual(expect.arrayContaining(['cordis_define']))
    const define = page.locator('[data-tool="cordis_define"]').first()
    await expandOwningTurnProcess(page, define)
    await define.locator('[aria-expanded]').first().click()
    await define.getByRole('tab', { name: 'Host' }).click()
    await expect.poll(() => define.textContent()).toContain('snapshot-noop')
    const stop = page.locator('[data-tool="cordis_stop"]').first()
    await expandOwningTurnProcess(page, stop)
    await expect.poll(() => stop.getAttribute('data-state')).toBe('ok')
    // The golden shows a reader above the tail; tool expansion can leave scroll sampling pending.
    const scrollport = page.locator('[data-conversation-scroll]')
    await scrollport.evaluate((element) => { element.scrollTop = 0 })
    await page.getByRole('button', { name: 'Back to bottom', exact: true }).waitFor()
    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  })
})

it('selects a retained Cordis version without dismissing its parent panel', async () => {
  const scaffold = await launchWebScaffold({})
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  await seedSession(scaffold, await readFile(FIXTURE, 'utf8'), SEED_ID)
  const runner = scaffold.ctx.dynamicCordisRunner
  const first = runner.define({ sessionId: SessionId(SEED_ID), plugin: { kind: 'new', idPrefix: 'choice' },
    name: 'Choice one', purpose: 'Inspect version selection', code: { host: 'return { apply() {} }' } })
  const second = runner.define({ sessionId: SessionId(SEED_ID), plugin: { kind: 'existing', pluginId: first.pluginId },
    name: 'Choice two with a longer retained package name', purpose: 'Inspect version selection', code: { host: 'return { apply() {} }' } })
  const page = await newEnglishPage(browser), tripwire = watchConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(scaffold.authenticatedUrl)
  await page.getByRole('button', { name: 'Cordis plugins', exact: true }).click()
  const panel = page.locator('[data-cordis-panel]')
  const selector = panel.getByRole('button', { name: 'Version', exact: true })
  for (const preference of ['light', 'dark'] as const) {
    await scaffold.ctx.settings.update('ui-theme', { preference })
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBe(preference === 'dark' ? '' : null)
    await selector.focus()
    await page.keyboard.press('ArrowDown')
    const item = page.getByRole('menuitem', { name: `Choice one · ${first.packageId}`, exact: true })
    await item.waitFor()
    await saveFailureShot(page, `screenshots/cordis-choice-${preference}`)
    await item.click()
    expect(await panel.isVisible()).toBe(true)
    expect(await selector.getAttribute('value')).toBe(first.packageId)
    await expect.poll(() => selector.evaluate(node => node === document.activeElement)).toBe(true)
    await selector.click()
    await page.getByRole('menuitem', { name: `Choice two with a longer retained package name · ${second.packageId}`, exact: true }).click()
    expect(await selector.getAttribute('value')).toBe(second.packageId)
  }
  await page.mouse.click(1000, 120)
  await panel.waitFor({ state: 'hidden' })
  expect(tripwire.pageErrors).toEqual([])
})
