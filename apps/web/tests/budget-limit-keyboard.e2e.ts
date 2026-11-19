/** Budget amounts use the same increment for the keyboard and the visible controls. */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

it('edits and saves a fractional limit with both increment paths', async () => {
  const scaffold = await launchWebScaffold({ developerTools: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.settings.update('balance', { source: 'local' })
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 980, height: 840 }, locale: ZH_BROWSER_LOCALE,
    reducedMotion: 'reduce' })
  try {
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await openSettings(page, 'zh')
    const settings = page.getByRole('dialog', { name: '设置', exact: true })
    await settings.getByRole('button', { name: '额度', exact: true }).click()
    const window = settings.getByRole('group', { name: '5 小时', exact: true })
    const input = window.getByRole('spinbutton')
    await expect.poll(() => input.inputValue()).toBe('50')
    expect(await input.evaluate(node => (node as HTMLInputElement).validity.valid)).toBe(true)
    await input.press('ArrowUp')
    expect(await input.inputValue()).toBe('51')
    expect(await input.evaluate(node => node === document.activeElement)).toBe(true)

    await input.fill('0.25')
    expect(await input.evaluate(node => (node as HTMLInputElement).validity.valid)).toBe(true)
    await input.press('ArrowUp')
    expect(await input.inputValue()).toBe('1.25')
    await window.getByRole('button', { name: '减少 5 小时限额' }).click()
    expect(await input.inputValue()).toBe('0.25')
    await input.press('ArrowDown')
    expect(Number(await input.inputValue())).toBe(0.000001)
    expect(await window.getByRole('button', { name: '减少 5 小时限额' }).isDisabled()).toBe(true)

    await input.fill('0.25')
    await window.getByRole('button', { name: '保存限额', exact: true }).click()
    await expect.poll(async () => (await scaffold.ctx.spendLimit.get()).preferences.limits['5h']).toBe(0.25)
    expect((await scaffold.ctx.spendLimit.get()).preferences.enabledPeriods).toEqual([])
  } finally { await page.close() }
})
