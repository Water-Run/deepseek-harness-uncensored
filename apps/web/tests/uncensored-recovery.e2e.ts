/** Native side commands and budget pauses through the assembled Web application. */
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SpendLedger, DEFAULT_PREFERENCES } from '@deepseek-ai/dsh-spend-limit/src/ledger.ts'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, selectedSessionFixture } from './scaffold.ts'
import { newConversationReplayPage } from './support.ts'

it('sends side arguments and collapses on close', async () => {
  const fixture = await selectedSessionFixture(fileURLToPath(new URL('../../../snapshots/web/feedback-command/session.v4.jsonl', import.meta.url)))
  const scaffold = await launchWebScaffold({ firstUse: true, replayFixture: fixture, compareReplaySession: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  try {
    const page = await newConversationReplayPage(browser)
    page.setDefaultTimeout(15000)
    await page.goto(scaffold.authenticatedUrl)
    const mainInput = page.locator('[data-composer-input][contenteditable="true"]').first()
    await mainInput.waitFor()
    const parent = scaffold.ctx.agents.list()[0]!
    await mainInput.fill('/side 现在情况如何')
    await mainInput.press('Enter')
    const side = page.locator('[data-aside="side"]')
    await side.waitFor()
    await expect.poll(() => scaffold.ctx.sessions.list()
      .find(session => session.header.parentSession === parent.session.id)?.snapshotEvents()
      .filter(event => event.type === 'user/message' && event.data.source.kind === 'user').length ?? 0).toBe(1)
    expect(parent.session.snapshotEvents().some(event => event.type === 'user/message'
      && event.data.source.kind === 'user')).toBe(false)
    const child = scaffold.ctx.sessions.list().find(session => session.header.parentSession === parent.session.id)!
    expect(child.snapshotEvents().filter(event => event.type === 'user/message').map(event => JSON.stringify(event.data)).join('')).toContain('现在情况如何')
    await expect.poll(() => scaffold.ctx.agents.get(child.id)?.status).toBe('idle')
    await page.getByRole('button', { name: 'Close', exact: true }).last().click()
    await expect.poll(() => page.locator('[class*="frame"]').first().getAttribute('data-rightbar-collapsed')).toBe('true')
    await mainInput.fill('/side')
    await mainInput.press('Enter')
    await side.waitFor()
    expect(scaffold.ctx.sessions.list().filter(session => session.header.parentSession === parent.session.id)).toHaveLength(1)
    expect(child.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(1)
  } finally {
    await browser.close()
  }
})

it('offers an icon and a working ungrouped creation action', async () => {
  const scaffold = await launchWebScaffold({ firstUse: true,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  try {
    const page = await newConversationReplayPage(browser)
    page.setDefaultTimeout(15000)
    await page.goto(scaffold.authenticatedUrl)
    await page.getByRole('button', { name: 'Choose workspace', exact: true }).click()
    const none = page.getByRole('menuitem', { name: 'Work without a workspace', exact: true })
    expect(await none.locator('svg').count()).toBeGreaterThan(0)
    await none.click()
    await expect.poll(() => page.getByRole('button', { name: 'Choose workspace', exact: true }).textContent()).toBe('Work without a workspace')
    await mkdir('.artifacts/screenshots/uncensored-recovery', { recursive: true })
    await page.screenshot({ path: '.artifacts/screenshots/uncensored-recovery/ungrouped.png' })
    await page.getByText('Ungrouped', { exact: true }).hover()
    await page.getByRole('button', { name: 'New session in Ungrouped', exact: true }).click()
    await expect.poll(() => page.getByRole('button', { name: 'Choose workspace', exact: true }).textContent()).toBe('Work without a workspace')
  } finally { await browser.close() }
})

it('shows a real admission wait and continues after the banner reset', async () => {
  const fixture = await selectedSessionFixture(fileURLToPath(new URL('../../../snapshots/web/feedback-command/session.v4.jsonl', import.meta.url)))
  const scaffold = await launchWebScaffold({ firstUse: true, replayFixture: fixture, compareReplaySession: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const ledger = await SpendLedger.open(join(scaffold.harnessHome, 'storages', 'spending.sqlite'))
  try {
    ledger.configure({ ...DEFAULT_PREFERENCES, enabledPeriods: ['5h'], autoResume: true,
      limits: { ...DEFAULT_PREFERENCES.limits, '5h': 5 } })
    const reserved = ledger.reserve(5_000_000)
    if (reserved.kind !== 'reserved') throw new Error('fixture charge was not admitted')
    ledger.settle(reserved.id, 5_000_000)
  } finally { ledger.close() }
  const browser = await chromium.launch()
  try {
    const page = await newConversationReplayPage(browser)
    page.setDefaultTimeout(15000)
    await page.goto(scaffold.authenticatedUrl)
    const input = page.locator('[data-composer-input][contenteditable="true"]').first()
    await input.fill('Reply with the single word LIGHTHOUSE and stop.')
    await input.press('Enter')
    const banner = page.getByRole('status').filter({ hasText: 'Conversation paused for budget' })
    await banner.waitFor()
    expect(await banner.textContent()).toContain('Estimated automatic continuation:')
    expect(scaffold.ctx.sessions.list().some(session => session.snapshotEvents().some(event => event.type === 'assistant/message'))).toBe(false)
    await page.setViewportSize({ width: 390, height: 844 })
    await mkdir('.artifacts/screenshots/uncensored-recovery', { recursive: true })
    await page.screenshot({ path: '.artifacts/screenshots/uncensored-recovery/budget-narrow.png' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await banner.getByRole('button', { name: 'Reset limits and continue', exact: true }).click()
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
    await banner.waitFor({ state: 'detached' })
    expect((await scaffold.ctx.spendLimit.get()).pausedSessions).toEqual([])
  } finally { await browser.close() }
})
