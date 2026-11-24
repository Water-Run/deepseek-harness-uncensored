/** Native side commands and budget pauses through the assembled Web application. */
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SpendLedger, DEFAULT_PREFERENCES } from '@deepseek-ai/dsh-spend-limit/src/ledger.ts'
import { chromium } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import { launchWebScaffold, selectedSessionFixture } from './scaffold.ts'
import { newConversationReplayPage } from './support.ts'

it('sends side arguments and collapses on close', async () => {
  const fixture = await selectedSessionFixture(fileURLToPath(new URL('../../../snapshots/web/feedback-command/session.v4.jsonl', import.meta.url)))
  const scaffold = await launchWebScaffold({ firstUse: true, replayFixture: fixture, compareReplaySession: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  const finish = Promise.withResolvers<undefined>()
  const release = scaffold.ctx.on('llm/stream', async function* (_options, next) {
    for await (const chunk of next()) {
      if (chunk.type === 'finish') await finish.promise
      yield chunk
    }
  })
  try {
    const page = await newConversationReplayPage(browser)
    page.setDefaultTimeout(15000)
    await page.goto(scaffold.authenticatedUrl)
    const mainInput = page.locator('[data-composer-input][contenteditable="true"]').first()
    await mainInput.waitFor()
    const parent = scaffold.ctx.agents.list()[0]!
    parent.session.append('turn/start', { turn: 1 })
    parent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await scaffold.ctx.sessions.flush(parent.session)
    await page.reload()
    await mainInput.waitFor()
    const launcher = page.getByRole('button', { name: 'Side question', exact: true }).first()
    await launcher.waitFor()
    const light = launcher.locator('[data-aside-status]')
    expect(await light.count()).toBe(0)
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
    await expect.poll(() => light.getAttribute('data-aside-status')).toBe('running')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    expect(await light.evaluate(node => getComputedStyle(node).animationName)).not.toBe('none')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await light.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
    finish.resolve(undefined)
    await expect.poll(() => scaffold.ctx.agents.get(child.id)?.status).toBe('idle')
    const end = child.snapshotEvents().findLast(event => event.type === 'turn/end')
    const settled = end?.type === 'turn/end' && end.data.reason.kind === 'completed' ? 'read' : 'interrupted'
    await expect.poll(() => light.getAttribute('data-aside-status')).toBe(settled)
    const screenshots = fileURLToPath(new URL('../../../.artifacts/screenshots/aside-launcher', import.meta.url))
    await mkdir(screenshots, { recursive: true })
    for (const preference of ['light', 'dark'] as const) {
      await scaffold.ctx.settings.update('ui-theme', { preference })
      await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme').then(value => value !== null)).toBe(preference === 'dark')
      await launcher.hover()
      const bounds = await launcher.boundingBox(), dot = await light.boundingBox()
      if (!bounds || !dot) throw new Error('Side status light is outside the layout')
      expect(dot.x).toBeLessThanOrEqual(bounds.x)
      expect(dot.x + dot.width).toBeGreaterThan(bounds.x)
      expect(dot.y).toBeLessThanOrEqual(bounds.y)
      expect(dot.y + dot.height).toBeGreaterThan(bounds.y)
      await page.screenshot({ path: join(screenshots, `${preference}.png`), clip: {
        x: Math.max(0, bounds.x - 80), y: Math.max(0, bounds.y - 8), width: 120, height: 60,
      } })
      await launcher.focus()
      expect(await launcher.evaluate(node => node.matches(':focus'))).toBe(true)
    }
    await page.getByRole('button', { name: 'Close', exact: true }).last().click()
    await expect.poll(() => page.locator('[class*="frame"]').first().getAttribute('data-rightbar-collapsed')).toBe('true')
    child.append('turn/start', { turn: 2 })
    child.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    await expect.poll(() => light.getAttribute('data-aside-status')).toBe('unread')
    await mainInput.fill('/side')
    await mainInput.press('Enter')
    await side.waitFor()
    await expect.poll(() => light.getAttribute('data-aside-status')).toBe('read')
    child.append('turn/start', { turn: 3 })
    child.append('turn/end', { turn: 3, reason: { kind: 'aborted', reason: { kind: 'user' } } })
    await expect.poll(() => light.getAttribute('data-aside-status')).toBe('interrupted')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Close', exact: true }).last().click()
    await launcher.waitFor()
    const narrow = await launcher.boundingBox()
    expect(narrow && narrow.x >= 0 && narrow.x + narrow.width <= 390).toBe(true)
    expect(scaffold.ctx.sessions.list().filter(session => session.header.parentSession === parent.session.id)).toHaveLength(1)
    expect(child.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(1)
  } finally {
    finish.resolve(undefined)
    release()
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

it('opens the published new Session when Workspace attachment fails', async () => {
  const scaffold = await launchWebScaffold({ firstUse: true,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  await workspace.setTitle('Association fixture')
  const browser = await chromium.launch()
  try {
    const page = await newConversationReplayPage(browser)
    page.setDefaultTimeout(15000)
    await page.goto(scaffold.authenticatedUrl)
    await page.getByRole('tree', { name: 'Sessions' }).getByText('Association fixture', { exact: true }).hover()
    const attachment = vi.spyOn(workspace, 'attachSession').mockRejectedValueOnce(new Error('fixture association failure'))
    onTestFinished(() => { attachment.mockRestore() })
    let creations = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/session/create') creations += 1 })
    await page.getByRole('button', { name: 'New session in Association fixture', exact: true }).click()
    const notice = page.getByRole('alert').filter({ hasText: 'Session created. Workspace assignment failed.' })
    await notice.waitFor()
    const id = attachment.mock.calls[0]?.[0]
    if (id === undefined) throw new Error('The Workspace attachment was not attempted')
    expect(await scaffold.ctx.sessionPersistence.stat(id)).toBeDefined()
    const row = page.locator(`[data-row-key="session:${id}"]`)
    await expect.poll(() => row.getAttribute('aria-selected')).toBe('true')
    await notice.getByRole('button', { name: 'Open session', exact: true }).click()
    await expect.poll(() => row.getAttribute('aria-selected')).toBe('true')
    expect(attachment).toHaveBeenCalledExactlyOnceWith(id)
    expect(creations).toBe(1)
  } finally { await browser.close() }
})

it.each(['settled expense', 'active reservation'] as const)('shows a real admission wait for %s and continues when budget returns', async (cause) => {
  const fixture = await selectedSessionFixture(fileURLToPath(new URL('../../../snapshots/web/feedback-command/session.v4.jsonl', import.meta.url)))
  const scaffold = await launchWebScaffold({ firstUse: true, replayFixture: fixture, compareReplaySession: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const ledger = await SpendLedger.open(join(scaffold.harnessHome, 'storages', 'spending.sqlite'))
  onTestFinished(() => { ledger.close() })
  const spent = cause === 'settled expense'
  ledger.configure({ ...DEFAULT_PREFERENCES, enabledPeriods: ['5h'], autoResume: spent,
    limits: { ...DEFAULT_PREFERENCES.limits, '5h': 5 } })
  const reserved = ledger.reserve(5_000_000)
  if (reserved.kind !== 'reserved') throw new Error('fixture charge was not admitted')
  if (spent) ledger.settle(reserved.id, 5_000_000)
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
    expect(scaffold.ctx.sessions.list().some(session => session.snapshotEvents().some(event => event.type === 'assistant/message'))).toBe(false)
    if (spent) {
      expect(await banner.textContent()).toContain('Estimated automatic continuation:')
      await page.setViewportSize({ width: 390, height: 844 })
      await mkdir('.artifacts/screenshots/uncensored-recovery', { recursive: true })
      await page.screenshot({ path: '.artifacts/screenshots/uncensored-recovery/budget-narrow.png' })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await banner.getByRole('button', { name: 'Reset limits and continue', exact: true }).click()
    } else {
      expect(await banner.textContent()).toContain('Waiting for in-flight requests to settle')
      expect(await banner.getByRole('button', { name: 'Resume', exact: true }).count()).toBe(0)
      expect(await banner.getByRole('button', { name: 'Reset limits and continue', exact: true }).count()).toBe(0)
      ledger.settle(reserved.id, 0)
    }
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
    await banner.waitFor({ state: 'detached' })
    expect((await scaffold.ctx.spendLimit.get()).pausedSessions).toEqual([])
    if (!spent) {
      const session = scaffold.ctx.sessions.list().find(value => value.snapshotEvents().some(event => event.type === 'assistant/message'))
      if (session === undefined) throw new Error('The fixture did not record its answer')
      ledger.blockSession(ledger.waitForSession(session.id, 5_000_000))
      try {
        ledger.configureWindow({ period: '5h', limit: 1 })
        await banner.getByText(/This request requires more budget/).waitFor()
        expect((await scaffold.ctx.spendLimit.get()).paused).toBe(false)
        expect(await banner.getByRole('button', { name: 'Reset limits and continue', exact: true }).count()).toBe(0)
        await banner.getByRole('button', { name: 'Adjust limits', exact: true }).click()
        await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('heading', { name: 'Budget', exact: true }).waitFor()
      } finally { ledger.clearSession(session.id) }
    }
  } finally { await browser.close() }
})
