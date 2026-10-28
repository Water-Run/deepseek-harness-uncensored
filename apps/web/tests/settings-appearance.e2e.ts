/** Built settings controls share radius and card materials across account, model, and plugin pages. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium, type Locator } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode,
} from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/settings-appearance', import.meta.url))

/** @param element - Rendered control or card. @returns Its visible geometry and material. */
function appearance(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      radius: style.borderRadius, border: style.borderTopWidth, stroke: style.borderTopColor,
      fill: style.backgroundColor, height: Math.round(node.getBoundingClientRect().height),
    }
  })
}

it('keeps consolidated settings controls and cards usable in both palettes', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
  })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.settings.mutate('ui-settings-account', [
    { op: 'set', path: ['step'], value: 'done' },
    { op: 'set', path: ['completion'], value: 'completed' },
  ])
  const account = scaffold.ctx.deepseekAccount
  const state: AccountView = {
    status: 'credential-stored', attempt: null,
    links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' },
  }
  // The Platform provider supplies synthetic identity and wallets; renderer, RPC, and settings remain real.
  const mocks = [
    vi.spyOn(account, 'getState').mockResolvedValue(state),
    vi.spyOn(account, 'getProfile').mockResolvedValue({
      status: 'ready', value: { id: null, name: 'Radius example', contact: 'r***@example.com', avatarUrl: null },
    }),
    vi.spyOn(account, 'getBalance').mockResolvedValue({
      status: 'ready', value: [{ currency: 'CNY', balance: '128.50' }],
      bonusWallets: [{ currency: 'CNY', balance: '12.00' }],
    }),
    vi.spyOn(account, 'watch').mockImplementation(async function* (signal) {
      yield state
      if (signal.aborted) return
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    }),
  ]
  onTestFinished(() => { mocks.forEach((mock) => { mock.mockRestore() }) })
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: ZH_BROWSER_LOCALE,
    timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
  await page.clock.setFixedTime(new Date('2026-03-20T04:00:00Z'))
  await page.addInitScript(() => { Object.defineProperty(globalThis, 'dshDesktop', { value: { protocolVersion: 1 } }) })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await openSettings(page, 'zh')
  const dialog = page.getByRole('dialog', { name: '设置', exact: true })

  for (const [palette, label] of [['light', '浅色'], ['dark', '深色']] as const) {
    await dialog.getByRole('navigation').getByRole('button', { name: '通用', exact: true }).click()
    await dialog.getByRole('radio', { name: label }).click()
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(palette === 'dark')
    const selector = await appearance(dialog.getByRole('button', { name: '完全权限', exact: true }))
    expect(selector.radius).toBe('12px')
    expect((await appearance(dialog)).radius).toBe('28px')

    await dialog.getByRole('navigation').getByRole('button', { name: '模型', exact: true }).click()
    const section = dialog.getByRole('region', { name: '账号', exact: true })
    await expect.poll(() => section.innerText()).toContain('Radius example')
    const cards = section.locator(':scope > div')
    expect(await cards.count()).toBe(1)
    const profile = await appearance(cards.nth(0))
    const material = { radius: profile.radius, border: profile.border, stroke: profile.stroke, fill: profile.fill }
    expect(material.radius).toBe('20px')
    expect(material.fill).not.toBe('rgba(0, 0, 0, 0)')
    await compareOrRefreshGolden(join(EXPECTED, 'account.expected.md'),
      await captureStableAria(page, 'section[aria-label="账号"]', scaffold.workspaceCwd), webSnapshotMode())

    await dialog.getByRole('navigation').getByRole('button', { name: '额度', exact: true }).click()
    await dialog.getByRole('heading', { name: '余额与统计', exact: true }).waitFor()
    await dialog.getByRole('heading', { name: '额度限制', exact: true }).waitFor()
    expect(await dialog.getByRole('tablist').count()).toBe(0)
    expect(await dialog.getByRole('progressbar').count()).toBe(2)
    const limit = dialog.getByRole('group', { name: '5 小时', exact: true })
    const input = limit.getByRole('spinbutton', { name: '5 小时限额（元）' })
    await expect.poll(() => input.evaluate((element) => {
      const container = element.closest('[role="group"]')
      if (container === null) return false
      const field = element.getBoundingClientRect(), bounds = container.getBoundingClientRect()
      return field.left >= bounds.left && field.right <= bounds.right
    })).toBe(true)
    const usage = await appearance(dialog.getByRole('link', { name: '查询用量', exact: true }))
    const topUp = await appearance(dialog.getByRole('link', { name: '充值', exact: true }))
    expect(usage).toMatchObject({ radius: '12px', height: 36 })
    expect(topUp).toMatchObject({ radius: '12px', height: 36 })
    await dialog.getByRole('navigation').getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('tab', { name: '插件列表', exact: true }).click()
    await dialog.getByRole('button', { name: /^全局/ }).click()
    const plugin = dialog.locator('[data-plugin-scope="global"] [data-plugin-entry]').first()
    await plugin.waitFor()
    expect(await appearance(plugin)).toMatchObject(material)

    await dialog.getByRole('navigation').getByRole('button', { name: '模式', exact: true }).click()
    const preset = dialog.locator('li').first()
    await preset.waitFor()
    expect((await appearance(preset)).radius).toBe('20px')

    await dialog.getByRole('button', { name: '模型', exact: true }).click()
    await dialog.getByRole('button', { name: '添加模型提供商', exact: true }).click()
    const field = dialog.getByLabel('提供商', { exact: true })
    await field.waitFor()
    expect(await appearance(field)).toMatchObject({ radius: '12px', height: 32 })
    expect(await dialog.locator('select').count()).toBe(0)
    const save = await appearance(dialog.getByRole('button', { name: '保存', exact: true }))
    expect(save).toMatchObject({ radius: '12px', height: 36 })
    await compareOrRefreshGolden(join(EXPECTED, `${palette}.expected.md`),
      JSON.stringify({ card: material, selector, usage, topUp, save }, null, 2), webSnapshotMode())
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
  }
})
