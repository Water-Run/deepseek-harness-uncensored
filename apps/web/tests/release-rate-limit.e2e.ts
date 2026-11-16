/** GitHub update failures and explicit recovery in the assembled, keyless conversation UI. */
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold, selectedSessionFixture } from './scaffold.ts'
import { configureConversationReplay, openSettings, saveFailureShot } from './support.ts'

for (const copy of [
  { locale: 'en-US', menu: 'Account menu', about: 'About', close: 'Close', check: 'Check for updates',
    language: 'en', settings: 'Settings', light: 'Light', dark: 'Dark',
    limited: 'GitHub request limit reached. Retry after ', suffix: '.',
    forbidden: 'GitHub refused this check. Try again later.', unpublished: 'No compatible published release yet' },
  { locale: 'zh-CN', menu: '账号菜单', about: '关于', close: '关闭', check: '检查更新',
    language: 'zh', settings: '设置', light: '浅色', dark: '深色',
    limited: 'GitHub 请求已限流，', suffix: ' 后可重试',
    forbidden: 'GitHub 拒绝了本次检查，请稍后重试', unpublished: '暂无适用的已发布版本' },
] as const) {
  it(`retains GitHub cooldown and requires manual retry in ${copy.locale}`, async () => {
    const fixture = await selectedSessionFixture(fileURLToPath(new URL('../../../snapshots/web/feedback-command/session.v4.jsonl', import.meta.url)))
    const scaffold = await launchWebScaffold({ firstUse: true, replayFixture: fixture, compareReplaySession: false,
      extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
    onTestFinished(() => scaffold.close())
    const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {})
    let failurePage: Page | undefined
    try {
      const page = await configureConversationReplay(await browser.newPage({ locale: copy.locale, timezoneId: 'Asia/Shanghai' }))
      failurePage = page
      await page.clock.install()
      let requests = 0
      let response: 'limited' | 'forbidden' | 'unpublished' = 'limited'
      await page.route('https://api.github.com/repos/Water-Run/deepseek-harness-uncensored/releases**', async (route) => {
        requests++
        await route.fulfill({ status: response === 'limited' ? 429 : response === 'forbidden' ? 403 : 200,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*',
            'access-control-expose-headers': 'Retry-After, X-RateLimit-Remaining, X-RateLimit-Reset',
            ...(response === 'limited' ? { 'retry-after': '3600' } : {}) },
          body: response === 'unpublished' ? '[]' : '{}' })
      })
      await page.goto(scaffold.authenticatedUrl)
      const composer = page.locator('[data-composer-input][contenteditable="true"]').first()
      await composer.fill('Reply with the single word LIGHTHOUSE and stop.')
      await composer.press('Enter')
      await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
      const openAbout = async () => {
        await page.getByRole('button', { name: copy.menu, exact: true }).click()
        await page.getByRole('menuitem', { name: copy.about, exact: true }).click()
      }
      await openAbout()
      const dialog = page.getByRole('dialog', { name: copy.about, exact: true })
      const status = dialog.getByRole('status')
      const button = dialog.getByRole('button', { name: copy.check, exact: true })
      await expect.poll(() => status.innerText()).toContain(copy.limited)
      await expect.poll(() => button.isDisabled()).toBe(true)
      const limited = await status.innerText()
      expect(limited.endsWith(copy.suffix)).toBe(true)
      expect(limited.slice(copy.limited.length, -copy.suffix.length)).toMatch(/\d/u)
      const heldRequests = requests
      await dialog.getByRole('button', { name: copy.close, exact: true }).click()
      await openAbout()
      await expect.poll(() => button.isDisabled()).toBe(true)
      expect(requests).toBe(heldRequests)
      const screenshots = join('.artifacts/screenshots/release-rate-limit', copy.locale)
      await mkdir(screenshots, { recursive: true })
      for (const scene of [{ width: 1280, colorScheme: 'light' }, { width: 390, colorScheme: 'dark' }] as const) {
        await page.setViewportSize({ width: scene.width, height: 900 })
        await dialog.getByRole('button', { name: copy.close, exact: true }).click()
        await openSettings(page, copy.language)
        const settings = page.getByRole('dialog', { name: copy.settings, exact: true })
        await settings.getByRole('radio', { name: scene.colorScheme === 'light' ? copy.light : copy.dark }).click()
        await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))).toBe(scene.colorScheme === 'dark')
        await settings.getByRole('button', { name: copy.close, exact: true }).click()
        await openAbout()
        expect(requests).toBe(heldRequests)
        await button.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: join(screenshots, `${scene.width}-${scene.colorScheme}.png`) })
      }
      await page.clock.fastForward(61_000)
      await expect.poll(() => button.isDisabled()).toBe(true)
      expect(requests).toBe(heldRequests)
      await page.clock.fastForward(3540_000)
      await expect.poll(() => button.isEnabled()).toBe(true)
      expect(requests).toBe(heldRequests)
      response = 'forbidden'
      await button.click()
      await expect.poll(() => status.innerText()).toBe(copy.forbidden)
      await expect.poll(() => button.isEnabled()).toBe(true)
      expect(requests).toBe(heldRequests + 1)
      response = 'unpublished'
      await button.click()
      await expect.poll(() => status.innerText()).toBe(copy.unpublished)
      expect(requests).toBe(heldRequests + 2)
      const output = `${copy.limited}<deadline>${copy.suffix}\n${copy.check} (disabled)\n\n${copy.forbidden}\n${copy.check} (enabled)\n\n${copy.unpublished}\n`
      await expect(output).toMatchFileSnapshot(join(import.meta.dirname, 'expected/release-rate-limit', `${copy.locale}.expected.md`))
    } catch (error) {
      if (failurePage !== undefined) await saveFailureShot(failurePage, `release-rate-limit-${copy.locale}`)
      throw error
    } finally { await browser.close() }
  })
}
