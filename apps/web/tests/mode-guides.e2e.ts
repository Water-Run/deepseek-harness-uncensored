/** Mode help and embedded plugin actions remain readable in both themes and narrow windows. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

it('fits mode help to its content and keeps plugin actions on the settings surface', async () => {
  const scaffold = await launchWebScaffold({ developerTools: false,
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const screenshots = fileURLToPath(new URL('../../../.artifacts/screenshots/mode-guides', import.meta.url))
  await mkdir(screenshots, { recursive: true })
  for (const width of [1440, 390]) for (const theme of ['浅色', '深色']) {
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
      const trigger = settings.getByRole('button', { name: '模式说明: 网安', exact: true })
      await trigger.click()
      const guide = page.getByRole('dialog', { name: '网安', exact: true })
      await guide.getByRole('heading', { name: '模式能力', exact: true }).waitFor()
      const bounds = await guide.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
      if (width === 1440) expect(bounds!.height).toBeLessThan(520)
      expect(await guide.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await page.screenshot({ path: join(screenshots, `${width}-${theme}-explanation.png`) })
      await guide.getByRole('tab', { name: '如何使用', exact: true }).click()
      const usage = guide.getByRole('tabpanel', { name: '如何使用', exact: true })
      await usage.waitFor()
      expect(await usage.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await page.screenshot({ path: join(screenshots, `${width}-${theme}-usage.png`) })
      await page.keyboard.press('Escape')
      await guide.waitFor({ state: 'hidden' })
      expect(await trigger.evaluate(node => node === document.activeElement)).toBe(true)
      await settings.getByRole('button', { name: '插件', exact: true }).click()
      const bar = settings.locator('[data-plugin-bar][data-natural]')
      await bar.waitFor()
      expect(await bar.evaluate(node => getComputedStyle(node, '::before').backgroundColor))
        .toBe(await settings.evaluate(node => getComputedStyle(node).backgroundColor))
      await settings.getByRole('button', { name: '刷新', exact: true }).waitFor()
      await page.screenshot({ path: join(screenshots, `${width}-${theme}-plugins.png`) })
    } finally { await page.close() }
  }
})
