/** DSHU General settings on a Desktop shell carrying a legacy channel preference. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

it('shows the DSHU version without querying the legacy update selector', async () => {
  const scaffold = await launchWebScaffold({})
  try {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 840 }, locale: ZH_BROWSER_LOCALE })
      const tripwire = watchConsole(page)
      let reads = 0
      await page.exposeFunction('readLegacyChannel', () => {
        reads++
        return { channel: 'nightly', packagedChannel: 'latest', changing: false }
      })
      await page.addInitScript(() => {
        const bridge = globalThis as typeof globalThis & { readLegacyChannel(): Promise<object> }
        Object.assign(globalThis, { dshDesktop: { protocolVersion: 1, updates: {
          status: async () => ({ phase: 'idle' }), open: async () => {}, subscribe: () => () => {},
          channels: { get: () => bridge.readLegacyChannel(), subscribe: () => () => {} },
        } } })
      })
      await page.goto(scaffold.authenticatedUrl)
      await openSettings(page, 'zh')
      const dialog = page.getByRole('dialog', { name: '设置' })
      const version = dialog.getByText(/^当前版本：\s*\d/u)
      await version.scrollIntoViewIfNeeded()
      expect(await dialog.getByText('更新渠道', { exact: true }).count()).toBe(0)
      expect(await dialog.getByText('正式版', { exact: true }).count()).toBe(0)
      expect(reads).toBe(0)
      const output = new URL('../../../.artifacts/screenshots/dshu-update-feed/', import.meta.url)
      await mkdir(fileURLToPath(output), { recursive: true })
      await dialog.screenshot({ path: fileURLToPath(new URL('general-zh.png', output)) })
      expect(tripwire.pageErrors).toEqual([])
      expect(tripwire.warnings).toEqual([])
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
