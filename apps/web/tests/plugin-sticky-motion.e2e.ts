/** Embedded plugin management shares the Settings scroll viewport. */
import { chromium, type Locator } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { openPluginManager } from './support.ts'

async function scrollTo(owner: Locator, offset: number): Promise<void> {
  await owner.evaluate(async (element, value) => {
    element.scrollTop = value
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
    })
  }, offset)
}

async function geometry(panel: Locator, owner: Locator) {
  const control = (await panel.locator('[data-plugin-toolbar]').boundingBox())!
  const bounds = (await panel.boundingBox())!
  const viewport = (await owner.boundingBox())!
  expect(control.width).toBeGreaterThan(0)
  expect(control.x).toBeGreaterThanOrEqual(bounds.x)
  expect(control.x + control.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.5)
  expect(bounds.x).toBeGreaterThanOrEqual(viewport.x)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.x + viewport.width + 0.5)
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  return {
    range: await owner.evaluate(element => element.scrollHeight - element.clientHeight),
    offset: await owner.evaluate(element => element.scrollTop),
    first: (await panel.locator('[data-plugin-package]').first().boundingBox())!.y,
  }
}

it.each([false, true])('keeps embedded plugin controls and cards reachable across widths (market: %s)', async (market) => {
  const scaffold = await launchWebScaffold(market ? {
    profile: { packages: [], bundles: ['@deepseek-ai/dsh-experimental-plugin-market-bundle'] },
  } : {})
  try {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, locale: 'en-US', reducedMotion: 'reduce' })
      const console = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      const panel = await openPluginManager(page, 'en')
      const dialog = page.getByRole('dialog', { name: 'Settings', exact: true })
      const owner = dialog.locator('[class*="_options"]')
      const body = panel.locator('[data-plugin-body]')
      await panel.locator('[data-plugin-package]').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      const refresh = await panel.getByRole('button', { name: 'Refresh', exact: true }).elementHandle()
      if (refresh === null) throw new Error('Plugin refresh control is missing')
      try {
        for (const width of [1280, 600, 390]) {
          await page.setViewportSize({ width, height: 640 })
          await scrollTo(owner, 0)
          const start = await geometry(panel, owner)
          expect(start.range).toBeGreaterThan(0)
          expect(await panel.locator('h1').isVisible()).toBe(false)
          for (const offset of [8, 64, start.range]) {
            await scrollTo(owner, offset)
            const current = await geometry(panel, owner)
            expect(current.range).toBe(start.range)
            expect(current.first).toBeCloseTo(start.first - current.offset, 1)
            expect(await body.evaluate(element => element.scrollTop)).toBe(0)
          }
          const last = panel.locator('[data-plugin-package]').last()
          await last.scrollIntoViewIfNeeded()
          expect(await last.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
          })).toBe(true)
          await scrollTo(owner, 0)
          expect(await geometry(panel, owner)).toEqual(start)
          expect(await refresh.evaluate(element => element.isConnected)).toBe(true)
          await panel.getByRole('button', { name: 'Add plugin', exact: true }).click()
          const install = page.getByRole('dialog', { name: 'Add plugin', exact: true })
          await install.waitFor()
          await install.getByRole('button', { name: 'Close', exact: true }).click()
        }
      } finally { await refresh.dispose() }
      expect(console.pageErrors).toEqual([])
      expect(console.warnings).toEqual([])
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})

it('fits the Settings scrollbar gutter and restores the list after scrolling', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [], bundles: ['@deepseek-ai/dsh-experimental-plugin-market-bundle'] },
  })
  try {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, locale: 'en-US', reducedMotion: 'reduce' })
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      const panel = await openPluginManager(page, 'en')
      await panel.locator('[data-plugin-package]').first().waitFor()
      const owner = page.getByRole('dialog', { name: 'Settings', exact: true }).locator('[class*="_options"]')
      await owner.evaluate((element) => { element.style.scrollbarGutter = 'stable both-edges' })
      await scrollTo(owner, 0)
      expect(await owner.evaluate(element => element.getBoundingClientRect().width - element.clientWidth)).toBeGreaterThan(0)
      const initial = await geometry(panel, owner)
      await scrollTo(owner, initial.range)
      expect((await geometry(panel, owner)).range).toBe(initial.range)
      await scrollTo(owner, 0)
      expect(await geometry(panel, owner)).toEqual(initial)
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
