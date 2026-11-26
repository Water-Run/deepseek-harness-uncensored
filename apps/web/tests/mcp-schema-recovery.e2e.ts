/** Reopen a failed conversation and read the recovery instructions for its recorded tool declarations without submitting a turn. */
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
    const recording = await readFile(join(directory, 'session.v4.jsonl'), 'utf8')
    const cases = [
      { id: 'mcp-schema-recovery', tool: 'mcp__notes__lookup_archive', expectedFile: 'recovery.expected.txt' },
      { id: 'mcp-schema-declared', tool: 'mcp__notes__lookup', expectedFile: 'declared.expected.txt' },
    ]
    for (const { id, tool } of cases) {
      const tools = [{ name: tool, description: 'Look up a note.', parameters: { type: 'object', properties: {} } }]
      await seedSession(scaffold, recording.replace('"{{tools}}"', JSON.stringify(tools)), id)
    }
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser)
      onTestFailed(() => saveFailureShot(page, 'mcp-schema-recovery'))
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.locator('[role="treeitem"]').first().click()
      for (const { id, expectedFile } of cases) {
        await page.setViewportSize({ width: 1280, height: 780 })
        await page.locator(`[data-row-key="session:${id}"]`).click()
        await page.getByText("Invalid schema for function 'mcp__notes__lookup': invalid pattern", { exact: true }).waitFor()
        const summary = page.getByText('How to recover this conversation', { exact: true })
        await summary.waitFor()
        const details = page.locator('details').filter({ has: summary })
        const expected = (await readFile(join(directory, expectedFile), 'utf8')).trimEnd().split(/\r?\n/u)
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
          await page.screenshot({ animations: 'disabled', path: join(process.cwd(), '.artifacts', `${id}-${width}.png`) })
          await summary.press('Space')
          await expect.poll(() => details.getAttribute('open')).toBeNull()
        }
      }
      await assertFixtureInventory(directory, ['session.v4.jsonl', ...cases.map(item => item.expectedFile)])
    } finally {
      await browser.close()
    }
  } finally {
    await scaffold.close()
  }
}, 120_000)
