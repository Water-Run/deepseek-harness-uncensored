/** Four shipped modes expose help, read-only composition and configuration independent of selection. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./expected/agent-preset-authoring', import.meta.url))
const mode = webSnapshotMode()

describe('web e2e: preset roster guidance', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  beforeAll(async () => {
    scaffold = await launchWebScaffold({ profile: { packages: [] },
      extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE, reducedMotion: 'reduce' })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await openSettings(page, 'zh')
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '模式', exact: true }).click()
    await page.getByRole('heading', { name: '模式', exact: true }).waitFor()
  }, 120_000)
  afterAll(async () => { await browser?.close(); await scaffold?.close() })

  it('shows the shipped roster with mode help and a read-only view, and no editing actions', async () => {
    onTestFailed(() => saveFailureShot(page, 'preset-roster-section'))
    await expect.poll(() => page.locator('[data-agent-preset-id]').count()).toBe(4)
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(EXPECTED, 'section.expected.md'), snapshot, mode)
    const ids = await page.locator('[data-agent-preset-id]').evaluateAll(rows => rows.map(row => row.getAttribute('data-agent-preset-id')))
    expect(ids).toEqual(['standard', 'security', 'reverse', 'writing'])
    expect(snapshot).not.toContain('让 Agent 帮我创建预设模式')
    expect(snapshot).toContain('查看配置: 缺省')
    expect(snapshot).not.toContain('复制预设')
    expect(snapshot).not.toContain('编辑插件')
    expect(snapshot).not.toContain('打开目录')
    expect(snapshot).not.toContain('删除')
  })

  it('reads mode details and examples without changing the current mode', async () => {
    onTestFailed(() => saveFailureShot(page, 'preset-roster-guide'))
    const settings = page.getByRole('dialog', { name: '设置' })
    const trigger = settings.getByRole('button', { name: '模式说明: 网安', exact: true })
    await trigger.click()
    const guide = page.getByRole('dialog', { name: '网安', exact: true })
    await guide.getByRole('heading', { name: '模式能力', exact: true }).waitFor()
    await guide.getByRole('tab', { name: '如何使用', exact: true }).click()
    await guide.getByRole('heading', { name: '审查应用', exact: true }).waitFor()
    await guide.getByRole('tab', { name: '如何使用', exact: true }).press('Escape')
    await guide.waitFor({ state: 'detached' })
    expect(await trigger.evaluate(element => document.activeElement === element)).toBe(true)
    expect(await settings.locator('[data-agent-preset-id="standard"] button[aria-pressed]').getAttribute('aria-pressed')).toBe('true')
  })

  it('views a shipped composition read-only', async () => {
    onTestFailed(() => saveFailureShot(page, 'preset-roster-view'))
    const settings = page.getByRole('dialog', { name: '设置' })
    await settings.getByRole('button', { name: '查看配置: 缺省', exact: true }).click()
    const viewer = page.getByRole('dialog', { name: '查看配置 · 缺省', exact: true })
    await viewer.waitFor({ timeout: 10_000 })
    // The real shipped declaration, not a golden: the viewer shows whatever
    // the deployment ships, and this lane only asserts it is shown read-only
    // in the Loader's own dialect.
    const shown = await viewer.locator('pre').textContent()
    expect(shown).toContain("- id: persona\n  name: '@deepseek-ai/dsh-persona'\n")
    expect(shown).toContain("name: '@deepseek-ai/dsh-tool-pwsh'")
    expect(shown).toContain("disabled: !!js process.platform === 'win32'\n")
    expect(shown).not.toContain('__jsExpr')
    expect(await viewer.getByRole('textbox').count()).toBe(0)
    // The header X and the footer button share the 关闭 name; the footer one is last.
    await viewer.getByRole('button', { name: '关闭', exact: true }).last().click()
    await viewer.waitFor({ state: 'detached', timeout: 10_000 })
    expect(await settings.locator('[data-agent-preset-id="standard"] button[aria-pressed]').getAttribute('aria-pressed')).toBe('true')
  })

  it('opens another mode configuration without changing the current mode', async () => {
    onTestFailed(() => saveFailureShot(page, 'preset-roster-configuration'))
    const settings = page.getByRole('dialog', { name: '设置' })
    const reverse = settings.locator('[data-agent-preset-id="reverse"]')
    await reverse.getByRole('button', { name: '配置', exact: true }).click()
    await settings.getByRole('region', { name: '逆向', exact: true }).waitFor()
    expect(await settings.locator('[data-agent-preset-id="standard"] button[aria-pressed]').getAttribute('aria-pressed')).toBe('true')
    expect(await reverse.locator('button[aria-pressed]').getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps mode names and selection controls accessible at narrow and full widths', async () => {
    const settings = page.getByRole('dialog', { name: '设置' })
    for (const [width, preference] of [[390, 'dark'], [1280, 'light']] as const) {
      await scaffold.ctx.settings.update('ui-theme', { preference })
      await page.setViewportSize({ width, height: 900 })
      await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(preference === 'dark')
      const standard = settings.locator('[data-agent-preset-id="standard"] button[aria-pressed]')
      await standard.scrollIntoViewIfNeeded()
      expect(await standard.isVisible()).toBe(true)
      expect(await settings.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await saveFailureShot(page, `screenshots/mode-settings-${preference}-${width}`)
    }
  })

  it('runs without page errors or model calls', () => { expect(tripwire.pageErrors).toEqual([]) })
})
