/** Reopen a failed conversation and read its server-level recovery instructions without submitting a turn. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFailed } from 'vitest'
import { assertFixtureInventory, launchWebScaffold, seedSession } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const directory = fileURLToPath(new URL('../../../snapshots/web/mcp-schema-recovery/', import.meta.url))

it('opens the recorded MCP recovery instructions on desktop and a narrow screen', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  try {
    await seedSession(scaffold, await readFile(join(directory, 'session.v4.jsonl'), 'utf8'), 'mcp-schema-recovery')
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser)
      onTestFailed(() => saveFailureShot(page, 'mcp-schema-recovery'))
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.locator('[role="treeitem"]').first().click()
      await page.locator('[data-row-key="session:mcp-schema-recovery"]').click()
      const summary = page.getByText('How to recover this conversation', { exact: true })
      await summary.waitFor()
      const details = page.locator('details').filter({ has: summary })
      const expected = (await readFile(join(directory, 'recovery.expected.txt'), 'utf8')).trimEnd().split(/\r?\n/u)
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 780 })
        await summary.click({ trial: true, position: { x: 6, y: 6 } })
        await summary.focus()
        await summary.press('Enter')
        await expect.poll(() => details.getAttribute('open')).not.toBeNull()
        expect((await details.innerText()).split(/\n+/u)).toEqual(expected)
        const box = await details.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ animations: 'disabled', path: join(process.cwd(), '.artifacts', `mcp-schema-recovery-${width}.png`) })
        await summary.press('Space')
        await expect.poll(() => details.getAttribute('open')).toBeNull()
      }
      await assertFixtureInventory(directory, ['session.v4.jsonl', 'recovery.expected.txt'])
    } finally {
      await browser.close()
    }
  } finally {
    await scaffold.close()
  }
}, 120_000)
