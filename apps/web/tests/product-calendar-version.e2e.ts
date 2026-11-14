/** Public calendar identity remains readable in the shipped About dialog at compact widths. */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { configureConversationReplay, saveFailureShot } from './support.ts'

it.each([
  { locale: 'en-US', account: 'Account menu', about: 'About', version: 'Uncensored version', check: 'Check for updates' },
  { locale: 'zh-CN', account: '账号菜单', about: '关于', version: 'Uncensored 版本', check: '检查更新' },
])('shows a calendar version without overflow ($locale)', async (labels) => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ locale: labels.locale, viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce' })
    await configureConversationReplay(page)
    let checks = 0
    await page.route('https://api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases**', async (route) => {
      checks++
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    const consoleWatch = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: labels.account, exact: true }).click()
    await page.getByRole('menuitem', { name: labels.about, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: labels.about, exact: true })
    await dialog.waitFor()
    const version = dialog.getByText(labels.version, { exact: true }).locator('..').locator('dd')
    expect(await version.textContent()).toMatch(/^\d{4}\.\d{2}\.\d{2}\.[1-9]\d*$/u)
    const refresh = dialog.getByRole('button', { name: labels.check, exact: true })
    await expect.poll(() => refresh.isEnabled()).toBe(true)
    const initialChecks = checks
    await refresh.click()
    await expect.poll(() => checks).toBe(initialChecks + 1)
    for (const width of [1200, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => dialog.evaluate((node) => {
        const bounds = node.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1
      })).toBe(true)
      await saveFailureShot(page, `screenshots/calendar-about-${labels.locale}-${width}`)
    }
    expect(consoleWatch.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
})
