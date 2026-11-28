/** The About dialog fits a full-screen window without a vertical scrollbar. */
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Locator } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { configureConversationReplay } from './support.ts'

/** Scrollable descendants of the dialog, named by class for a readable failure. */
async function scrollableDescendants(dialog: Locator): Promise<string[]> {
  return dialog.evaluate((node: Element) => [node, ...node.querySelectorAll('*')]
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => {
      const style = getComputedStyle(element)
      return (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1
    })
    .map(element => `${element.className || element.tagName}:${element.scrollHeight}/${element.clientHeight}`))
}

const nextVersion = '2099.01.01.0'

it.each([
  { locale: 'zh-CN', account: '账号菜单', about: '关于', status: '有新版本' },
  { locale: 'en-US', account: 'Account menu', about: 'About', status: 'A new version is available' },
])('keeps the About dialog scroll-free at full-screen heights ($locale)', async (labels) => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ locale: labels.locale, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await configureConversationReplay(page)
    await page.route('https://api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases**', async (route) => {
      await route.fulfill({ json: [{
        tag_name: `v${nextVersion}`, prerelease: false,
        html_url: `https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v${nextVersion}`,
      }] })
    })
    const consoleWatch = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: labels.account, exact: true }).click()
    await page.getByRole('menuitem', { name: labels.about, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: labels.about, exact: true })
    await dialog.waitFor()
    await dialog.getByText(`${labels.status} · ${nextVersion}`, { exact: true }).waitFor()
    expect(await dialog.getByText(labels.about, { exact: true }).count()).toBe(0)

    const shots = fileURLToPath(new URL('../../../.artifacts/screenshots/about', import.meta.url))
    await mkdir(shots, { recursive: true })
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport)
      await expect.poll(() => scrollableDescendants(dialog), { timeout: 5000 }).toEqual([])
      const frame = await dialog.boundingBox()
      const brand = await dialog.getByRole('region').first().boundingBox()
      if (!frame || !brand) throw new Error('About layout is missing')
      expect(brand.x).toBeCloseTo(frame.x, 0)
      expect(brand.y).toBeCloseTo(frame.y, 0)
      expect(brand.height).toBeCloseTo(frame.height, 0)
      await dialog.screenshot({ path: join(shots, `${labels.locale}-${viewport.width}.png`) })
    }
    await page.setViewportSize({ width: 390, height: 760 })
    await scaffold.ctx.settings.update('ui-theme', { preference: 'dark' })
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(true)
    const banner = dialog.getByRole('region').first()
    const frame = await dialog.boundingBox()
    const brand = await banner.boundingBox()
    if (!frame || !brand) throw new Error('About banner is missing')
    expect(brand.width).toBeCloseTo(frame.width, 0)
    await dialog.screenshot({ path: join(shots, labels.locale + '-390.png') })
    await dialog.getByRole('link', { name: /^REA /u }).scrollIntoViewIfNeeded()
    await dialog.getByRole('button', { name: labels.locale === 'zh-CN' ? '关闭' : 'Close', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    expect(consoleWatch.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
})
