/** The About dialog fits a full-screen window without a vertical scrollbar. */
import { fileURLToPath } from 'node:url'
import { chromium, type Locator } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { configureConversationReplay, saveFailureShot } from './support.ts'

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

it.each([
  { locale: 'zh-CN', account: '账号菜单', about: '关于' },
  { locale: 'en-US', account: 'Account menu', about: 'About' },
])('keeps the About dialog scroll-free at full-screen heights ($locale)', async (labels) => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ locale: labels.locale, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await configureConversationReplay(page)
    await page.route('https://api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    const consoleWatch = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: labels.account, exact: true }).click()
    await page.getByRole('menuitem', { name: labels.about, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: labels.about, exact: true })
    await dialog.waitFor()

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport)
      await expect.poll(() => scrollableDescendants(dialog), { timeout: 5000 }).toEqual([])
      await saveFailureShot(page, `screenshots/about-fit-${labels.locale}-${viewport.width}x${viewport.height}`)
    }
    expect(consoleWatch.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
})
