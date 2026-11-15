/** Mode help and embedded plugin actions remain readable in both themes and narrow windows. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-settings'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

const layouts = [1440, 390].flatMap(width => ['浅色', '深色'].flatMap(theme => [14, 22].map(fontSize => ({ width, theme, fontSize }))))

it.each(layouts)('fits mode help and plugin actions ($width px, $theme, $fontSize px)', async ({ width, theme, fontSize }) => {
  const scaffold = await launchWebScaffold({ developerTools: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.settings.update('balance', { source: 'local' })
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const screenshots = fileURLToPath(new URL('../../../.artifacts/screenshots/mode-guides/density', import.meta.url))
  await mkdir(screenshots, { recursive: true })
  await scaffold.ctx.settings.update('ui-theme', { preference: theme === '深色' ? 'dark' : 'light', fontSize })
  const page = await browser.newPage({ viewport: { width, height: 900 }, locale: ZH_BROWSER_LOCALE,
    reducedMotion: 'reduce' })
  try {
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await openSettings(page, 'zh')
    const settings = page.getByRole('dialog', { name: '设置', exact: true })
    await settings.getByRole('button', { name: '通用', exact: true }).click()
    await settings.getByRole('radio', { name: theme }).click()
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBe(theme === '深色' ? '' : null)
    await settings.getByRole('button', { name: '模式', exact: true }).click()
    for (const [name, color] of [['缺省', 'rgb(37, 99, 235)'], ['网安', 'rgb(220, 38, 38)'], ['逆向', 'rgb(21, 128, 61)'], ['写作', 'rgb(161, 98, 7)']] as const) {
      const trigger = settings.getByRole('button', { name: `模式说明: ${name}`, exact: true })
      await trigger.click()
      const guide = page.getByRole('dialog', { name, exact: true })
      const explanation = guide.getByRole('tabpanel', { name: '模式说明', exact: true })
      await explanation.getByRole('heading').first().waitFor()
      expect(await guide.locator('[class*="guideHeader"]').evaluate(node => getComputedStyle(node).backgroundColor)).toBe(color)
      expect(await guide.getByRole('heading', { level: 2 }).evaluate(node => getComputedStyle(node).color)).toBe('rgb(255, 255, 255)')
      const headingContrast = await guide.evaluate((node) => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        const luminance = (color: string) => {
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          const bytes = context.getImageData(0, 0, 1, 1).data
          return [0.2126, 0.7152, 0.0722].reduce((total, weight, index) => {
            const value = bytes[index]! / 255
            return total + weight * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          }, 0)
        }
        const foreground = luminance(getComputedStyle(node.querySelector('h3')!).color)
        const background = luminance(getComputedStyle(node).backgroundColor)
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
      expect(headingContrast).toBeGreaterThanOrEqual(4.5)
      const bounds = await guide.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
      expect(await guide.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await page.screenshot({ path: join(screenshots, `${name}-${width}-${theme}-${fontSize}-explanation.png`), animations: 'disabled' })
      await guide.getByRole('tab', { name: '如何使用', exact: true }).click()
      const usage = guide.getByRole('tabpanel', { name: '如何使用', exact: true })
      await usage.waitFor()
      expect(await usage.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await usage.getByRole('heading').last().scrollIntoViewIfNeeded()
      expect(await guide.getByRole('button', { name: '关闭', exact: true }).isVisible()).toBe(true)
      await usage.evaluate((node) => { node.scrollTop = 0 })
      await page.screenshot({ path: join(screenshots, `${name}-${width}-${theme}-${fontSize}-usage.png`), animations: 'disabled' })
      await page.keyboard.press('Escape')
      await guide.waitFor({ state: 'hidden' })
      expect(await trigger.evaluate(node => node === document.activeElement)).toBe(true)
    }
    await settings.getByRole('button', { name: '插件', exact: true }).click()
    const bar = settings.locator('[data-plugin-bar][data-natural]')
    await bar.waitFor()
    expect(await bar.evaluate(node => getComputedStyle(node, '::before').backgroundColor))
      .toBe(await settings.evaluate(node => getComputedStyle(node).backgroundColor))
    await settings.getByRole('button', { name: '刷新', exact: true }).waitFor()
    await page.screenshot({ path: join(screenshots, `${width}-${theme}-${fontSize}-plugins.png`) })
  } finally { await page.close() }
})
