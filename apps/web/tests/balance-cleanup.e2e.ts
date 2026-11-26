/** Stored-sample cleanup and automatic retention in the balance sampling settings. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-balance'
import type { AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { BalanceCleanupRequest, BalanceHistoryTag } from '@deepseek-ai/dsh-balance/types'
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
    historyTag: 'test-history' as BalanceHistoryTag, status: 'ready' as const, source: 'api' as const, account: 'api-key' as const, sampleCount: 4,
    samples: [[0, 128.5], [1, 128.4], [181, 128.4], [182, 128.3]].map(([minute, amount]) => ({
      time: Date.UTC(2026, 10, 11, 0, minute ?? 0),
      wallets: [{ currency: 'CNY' as const, toppedUp: (amount ?? 0).toFixed(2), granted: '0' }] })),
  }
  const get = vi.spyOn(scaffold.ctx.uncensoredBalance, 'get').mockResolvedValue(snapshot)
  const requests: BalanceCleanupRequest[] = []
  const clear = vi.spyOn(scaffold.ctx.uncensoredBalance, 'clear').mockImplementation(async (_client, request, _view, expectedHistory) => {
    expect(expectedHistory).toBe(snapshot.historyTag)
    requests.push(request)
    return { ...snapshot, status: 'empty', sampleCount: 0, samples: [] }
  })
  onTestFinished(() => { get.mockRestore(); clear.mockRestore() })
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: ZH_BROWSER_LOCALE,
    timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await openSettings(page, 'zh')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('navigation').getByRole('button', { name: '额度', exact: true }).click()
  await dialog.getByRole('slider', { name: '总余额采样曲线' }).waitFor()
  await dialog.getByText('采样设置', { exact: true }).click()

  const cleanupButton = dialog.getByRole('button').filter({ hasText: /^(清理|确认清理)$/u })
  const manual = dialog.getByRole('group', { name: '清理存储的采样' })
  const automatic = dialog.getByRole('group', { name: '自动清理' })
  const keepDays = manual.getByRole('spinbutton', { name: '保留天数' })
  expect(await automatic.getByRole('spinbutton', { name: '保留天数' }).inputValue()).toBe('30')
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
  await expect.poll(() => requests).toEqual([{ mode: 'age', days: 7 }])

  await dialog.getByRole('button', { name: '清理存储的采样' }).click()
  await page.getByRole('menuitem', { name: '按条数', exact: true }).click()
  const keepCount = manual.getByRole('spinbutton', { name: '保留条数' })
  await keepCount.fill('0')
  expect(await keepCount.getAttribute('aria-invalid')).toBe('true')
  expect(await dialog.getByText('请输入 1–40320 之间的整数', { exact: true }).count()).toBe(1)
  expect(await cleanupButton.isEnabled()).toBe(false)
  await keepCount.fill('1')
  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await expect.poll(() => requests.at(-1)).toEqual({ mode: 'count', keep: 1 })

  await dialog.getByRole('button', { name: '清理存储的采样' }).click()
  await page.getByRole('menuitem', { name: '全部', exact: true }).click()
  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await expect.poll(() => cleanupButton.textContent()).toContain('确认清理')
  expect(requests.at(-1)).toEqual({ mode: 'count', keep: 1 })
  await cleanupButton.scrollIntoViewIfNeeded()
  await cleanupButton.click({ force: true })
  await expect.poll(() => requests.at(-1)).toEqual({ mode: 'all' })

  await dialog.getByRole('button', { name: '自动清理' }).click()
  await page.getByRole('menuitem', { name: '按条数', exact: true }).click()
  const retainedCount = automatic.getByRole('spinbutton', { name: '保留条数' })
  await retainedCount.fill('1')
  expect(await retainedCount.getAttribute('aria-invalid')).toBe('true')
  expect(await dialog.getByText('请输入 2–40320 之间的整数', { exact: true }).count()).toBe(1)
  await dialog.locator('details[open]').screenshot({ path: join(screenshots, 'count-minimum.png') })
  await retainedCount.fill('2')
  await retainedCount.blur()
  await expect.poll(() => retainedCount.getAttribute('aria-invalid')).toBe('false')
  await expect.poll(() => retainedCount.inputValue()).toBe('2')
})

it('keeps both stored histories until the user reviews and confirms the new account', async () => {
  const scaffold = await launchWebScaffold({ developerTools: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.settings.mutate('ui-settings-account', [
    { op: 'set', path: ['step'], value: 'done' }, { op: 'set', path: ['completion'], value: 'completed' },
  ])
  let account = 'second'
  const platform = vi.spyOn(scaffold.ctx.deepseekAccount, 'getPlatformSession').mockImplementation(async () => ({
    origin: 'https://balance.example', token: account, userId: account as AccountUserId,
  }))
  const provider = vi.spyOn(scaffold.ctx.deepseekAccount, 'getBalance').mockImplementation(async () => ({
    status: 'ready', value: [{ currency: 'CNY', balance: account === 'first' ? '11' : '22' }], bonusWallets: [],
  }))
  onTestFinished(() => { provider.mockRestore(); platform.mockRestore() })
  const client = { version: 'test', locale: 'zh-CN', timezoneOffsetSeconds: 28800 }
  const read = () => scaffold.ctx.uncensoredBalance.get(client, 'history')
  const second = await read()
  account = 'first'
  const first = await read()
  expect(first.sampleCount).toBe(1)
  expect(second.sampleCount).toBe(1)
  expect(first.historyTag).not.toBe(second.historyTag)
  await scaffold.ctx.settings.mutate('balance', [
    { op: 'set', path: ['source'], value: 'local' }, { op: 'set', path: ['refreshSeconds'], value: 3600 },
  ])

  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ locale: ZH_BROWSER_LOCALE, viewport: { width: 1280, height: 900 } })
  await page.goto(scaffold.authenticatedUrl)
  await openSettings(page, 'zh')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })
  await dialog.getByRole('navigation').getByRole('button', { name: '额度', exact: true }).click()
  const chart = dialog.getByRole('slider', { name: '总余额采样曲线' })
  await expect.poll(() => chart.getAttribute('aria-valuetext')).toContain('11.00')
  await dialog.getByText('采样设置', { exact: true }).click()
  const controls = dialog.getByRole('group', { name: '清理存储的采样' })
  await controls.getByRole('button', { name: '清理存储的采样' }).click()
  await page.getByRole('menuitem', { name: '全部', exact: true }).click()
  const clear = controls.getByRole('button', { name: '清理', exact: true })
  const confirm = controls.getByRole('button', { name: '确认清理', exact: true })
  await clear.click()
  await confirm.waitFor()
  account = 'second'
  await confirm.click()
  await expect.poll(() => chart.getAttribute('aria-valuetext')).toContain('22.00')
  expect((await read()).samples).toEqual(second.samples)
  await clear.click()
  await confirm.waitFor()
  account = 'first'
  const refresh = dialog.getByRole('button', { name: '刷新', exact: true })
  await refresh.click()
  await expect.poll(() => chart.getAttribute('aria-valuetext')).toContain('11.00')
  await clear.waitFor()
  account = 'second'
  await refresh.click()
  await expect.poll(() => chart.getAttribute('aria-valuetext')).toContain('22.00')
  await clear.click()
  await confirm.click()
  await dialog.getByText('暂无记录，切换到 API 实时开始采样', { exact: true }).waitFor()
  expect((await read()).samples).toEqual([])
  account = 'first'
  expect((await read()).samples).toEqual(first.samples)
})
