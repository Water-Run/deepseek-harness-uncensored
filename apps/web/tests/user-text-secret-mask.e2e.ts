/** A cold-seeded user message that carries a credential draws it masked behind its reveal control. */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/user-text-secret-mask', import.meta.url))
// Borrowed read-only: this scenario needs any settled user message, not a new recording.
const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const MODE = webSnapshotMode()
const RECORDED_PROMPT = 'Use the read tool twice in one assistant message: read a.txt and b.txt. Then reply with the single word DONE and stop.'
// Assembled at run time so the repository holds no literal in a credential format.
const KEY = ['sk', '-', '0123456789abcdef0123456789abcdef'].join('')
const PROMPT = `${KEY} is the key for this task.`

describe('web e2e: credential mask in user text', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const raw = (await readFile(SEED, 'utf8')).replace(RECORDED_PROMPT, PROMPT)
    expect(fixtureUserPrompts(raw), 'adapted seed must carry the credential prompt').toContain(PROMPT)
    await seedSession(scaffold, raw, 'user-text-secret-mask')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('[role="treeitem"]').first().click()
    await page.locator('[role="treeitem"]').nth(1).click()
    await page.getByRole('button', { name: 'Show secret', exact: true }).waitFor()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it.each([[1680, 'light'], [390, 'light'], [390, 'dark']] as const)('masks and reveals without reflow at %s px in %s', async (width, theme) => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-text-secret-mask'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await scaffold.ctx.settings.update('ui-theme', { preference: theme })
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBe(theme === 'dark' ? '' : null)
    await page.setViewportSize({ width, height: 1000 })
    const text = page.locator('[class*="bubble"]', { has: page.locator('[data-secret]') })
    await text.hover()
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'bubble.expected.md'), await text.ariaSnapshot(), MODE)
    expect(await text.textContent()).not.toContain(KEY)
    const run = page.locator('[data-secret]')
    // The mask marks and the control share one vertical center.
    const centers = await run.evaluate((box) => {
      const middle = (element: Element): number => {
        const rect = element.getBoundingClientRect()
        return rect.top + rect.height / 2
      }
      const [value, control] = [...box.children]
      return { mask: middle(value!.lastElementChild!), control: middle(control!) }
    })
    if (width === 1680) expect(Math.abs(centers.control - centers.mask)).toBeLessThanOrEqual(1)
    const masked = { run: await run.boundingBox(), bubble: await text.boundingBox() }
    await page.getByRole('button', { name: 'Show secret', exact: true }).click()
    await expect.poll(() => text.textContent()).toBe(PROMPT)
    const revealed = { run: (await run.boundingBox())!, bubble: (await text.boundingBox())! }
    // Separate prefix/mask spans can round glyph advances by one Chromium layout unit.
    for (const name of ['run', 'bubble'] as const) for (const axis of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(revealed[name][axis] - masked[name]![axis])).toBeLessThanOrEqual(1 / 32)
    }
    expect(revealed.bubble.x).toBeGreaterThanOrEqual(0)
    expect(revealed.bubble.x + revealed.bubble.width).toBeLessThanOrEqual(width)
    expect(await text.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.getByRole('button', { name: 'Hide secret', exact: true }).click()
    await expect.poll(() => text.textContent()).not.toContain(KEY)
    const screenshots = fileURLToPath(new URL('../../../.artifacts/screenshots/secret-mask', import.meta.url))
    await mkdir(screenshots, { recursive: true })
    await page.screenshot({ path: join(screenshots, `${width}-${theme}.png`), animations: 'disabled' })
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['bubble.expected.md'])
  })
})
