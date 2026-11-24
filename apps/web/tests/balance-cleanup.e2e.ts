/** Stored-sample cleanup and automatic retention in the balance sampling settings. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-balance'
import type { BalanceCleanupRequest } from '@deepseek-ai/dsh-balance/types'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

it('cleans stored samples by age, by count, or completely, and keeps automatic retention', async () => {
  const scaffold = await launchWebScaffold({ developerTools: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.settings.mutate('ui-settings-account', [
    { op: 'set', path: ['step'], value: 'done' }, { op: 'set', path: ['completion'], value: 'completed' },
  ])
  const snapshot = {
    status: 'ready' as const, source: 'api' as const, account: 'api-key' as const, sampleCount: 4,
    samples: [[0, 128.5], [1, 128.4], [181, 128.4], [182, 128.3]].map(([minute, amount]) => ({
      time: Date.UTC(2026, 10, 11, 0, minute ?? 0),
      wallets: [{ currency: 'CNY' as const, toppedUp: (amount ?? 0).toFixed(2), granted: '0' }] })),
  }
  const get = vi.spyOn(scaffold.ctx.uncensoredBalance, 'get').mockResolvedValue(snapshot)
  const requests: BalanceCleanupRequest[] = []
  const clear = vi.spyOn(scaffold.ctx.uncensoredBalance, 'clear').mockImplementation(async (_client, request) => {
    requests.push(request)
    return { ...snapshot, status: 'empty', sampleCount: 0, samples: [] }
  })
  onTestFinished(() => { get.mockRestore(); clear.mockRestore() })
  const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {})
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: ZH_BROWSER_LOCALE,
    timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await openSettings(page, 'zh')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('navigation').getByRole('button', { name: '额度', exact: true }).click()
  await dialog.getByRole('slider').waitFor()
  await dialog.getByText('采样设置', { exact: true }).click()

  const cleanupButton = dialog.getByRole('button').filter({ hasText: /^(清理|确认清理)$/u })
  const keepDays = dialog.getByRole('spinbutton', { name: '保留天数' })
  await expect.poll(() => cleanupButton.isEnabled()).toBe(true)

  const screenshots = fileURLToPath(new URL('../../../.artifacts/screenshots/balance-cleanup', import.meta.url))
  await mkdir(screenshots, { recursive: true })
  for (const preference of ['light', 'dark'] as const) {
    await scaffold.ctx.settings.update('ui-theme', { preference })
    await dialog.getByText('自动清理', { exact: true }).scrollIntoViewIfNeeded()
    await dialog.locator('details[open]').screenshot({ path: join(screenshots, `${preference}.png`) })
  }

  await keepDays.fill('7')

  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await page.waitForTimeout(600)


  await expect.poll(() => requests).toEqual([{ mode: 'age', days: 7 }])

  await dialog.getByRole('button', { name: '清理存储的采样' }).click()
  await page.getByRole('menuitem', { name: '按条数', exact: true }).click()
  const keepCount = dialog.getByRole('spinbutton', { name: '保留条数' })
  await keepCount.fill('500')
  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await expect.poll(() => requests.at(-1)).toEqual({ mode: 'count', keep: 500 })

  await dialog.getByRole('button', { name: '清理存储的采样' }).click()
  await page.getByRole('menuitem', { name: '全部', exact: true }).click()
  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await page.waitForTimeout(300)
  await expect.poll(() => cleanupButton.textContent()).toContain('确认清理')
  expect(requests.at(-1)).toEqual({ mode: 'count', keep: 500 })
  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await expect.poll(() => requests.at(-1)).toEqual({ mode: 'all' })

  await dialog.getByRole('button', { name: '自动清理' }).click()
  await page.getByRole('menuitem', { name: '按条数', exact: true }).click()
  await expect.poll(() => dialog.getByRole('spinbutton', { name: '保留条数' }).count()).toBe(1)
})
