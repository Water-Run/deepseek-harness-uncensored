/** Balance sample bubbles stay inside their plot while its layout changes. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium, webkit } from 'playwright'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-balance'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

describe.each([{ name: 'Chromium', engine: chromium }, { name: 'WebKit', engine: webkit }])('balance history layout ($name)', ({ name, engine }) => {
  it('refits a retained sample bubble after a plot resize in both palettes and font sizes', async () => {
    const scaffold = await launchWebScaffold({ developerTools: false,
      extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
    onTestFinished(() => scaffold.close())
    await scaffold.ctx.settings.mutate('ui-settings-account', [
      { op: 'set', path: ['step'], value: 'done' }, { op: 'set', path: ['completion'], value: 'completed' },
    ])
    const balance = vi.spyOn(scaffold.ctx.uncensoredBalance, 'get').mockResolvedValue({
      status: 'ready', source: 'api', account: 'api-key', sampleCount: 2,
      samples: [128.50, 128.30].map((amount, index) => ({ time: Date.UTC(2026, 10, 11, 0, index),
        wallets: [{ currency: 'CNY', toppedUp: amount.toFixed(2), granted: '0' }] })),
    })
    onTestFinished(() => { balance.mockRestore() })
    const browser = await engine.launch()
    onTestFinished(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: ZH_BROWSER_LOCALE,
      timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await openSettings(page, 'zh')
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.getByRole('navigation').getByRole('button', { name: '额度', exact: true }).click()
    const plot = dialog.getByRole('slider')
    await plot.waitFor()
    const screenshots = fileURLToPath(new URL('../../../.artifacts/screenshots/balance-history-layout', import.meta.url))
    await mkdir(screenshots, { recursive: true })
    for (const preference of ['light', 'dark'] as const) for (const fontSize of [14, 22]) for (const width of [1280, 390]) {
      await scaffold.ctx.settings.update('ui-theme', { preference, fontSize })
      await expect.poll(() => page.evaluate(() => document.body.style.getPropertyValue('--dsh-content-font-size'))).toBe(`${String(fontSize)}px`)
      await page.setViewportSize({ width, height: 900 })
      await plot.scrollIntoViewIfNeeded()
      const rect = await plot.boundingBox()
      if (rect === null) throw new Error('Balance plot is missing')
      await plot.dispatchEvent('pointermove', { pointerType: 'mouse', clientX: rect.x + 20, clientY: rect.y + 20 })
      const tip = plot.getByRole('status')
      await tip.waitFor()
      const selected = await plot.getAttribute('aria-valuenow')
      await plot.evaluate((node) => { node.style.width = '100px' })
      await expect.poll(() => plot.evaluate((node) => {
        const bubble = node.querySelector('[role="status"]')
        if (bubble === null) return false
        const plot = node.getBoundingClientRect(), tip = bubble.getBoundingClientRect()
        return tip.left >= plot.left - 1 && tip.right <= plot.right + 1 && tip.top >= plot.top - 1 && tip.bottom <= plot.bottom + 1
      })).toBe(true)
      expect(await plot.getAttribute('aria-valuenow')).toBe(selected)
      expect(await tip.innerText()).toContain('¥128.50')
      await plot.evaluate((node) => { node.style.removeProperty('width') })
      await expect.poll(() => plot.evaluate((node) => {
        const bubble = node.querySelector('[role="status"]')!
        return bubble.getBoundingClientRect().right <= node.getBoundingClientRect().right + 1
      })).toBe(true)
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      if (width === 390 && fontSize === 22) await plot.locator('xpath=ancestor::section[1]').screenshot({ path: join(screenshots, `${name}-${preference}.png`) })
      await plot.dispatchEvent('pointerout', { pointerType: 'mouse' })
      await tip.waitFor({ state: 'hidden' })
    }
  })
})
