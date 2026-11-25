/** The memory opt-in takes effect on the Host and survives a reopened settings page. */
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-memory'
import { launchWebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

it('enables conversation memory independently of extraction and keeps saved records after disabling it', async () => {
  const scaffold = await launchWebScaffold({
    extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await browser.newPage({ locale: ZH_BROWSER_LOCALE })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await openSettings(page, 'zh')
  const master = page.getByRole('switch', { name: '跨对话记忆', exact: true })
  await master.waitFor()
  expect(await master.getAttribute('aria-checked')).toBe('false')
  await master.click()
  await expect.poll(() => scaffold.ctx.memory.enabled).toBe(true)
  const extract = page.getByRole('switch', { name: '自动提炼记忆' })
  await extract.waitFor()
  expect(await extract.getAttribute('aria-checked')).toBe('false')
  await scaffold.ctx.memory.create({ type: 'preference', content: '使用简体中文', scope: { global: true }, source: { kind: 'user', confirmed: true } })
  await page.reload({ waitUntil: 'load' })
  await openSettings(page, 'zh')
  await master.waitFor()
  expect(await master.getAttribute('aria-checked')).toBe('true')
  await master.click()
  await expect.poll(() => scaffold.ctx.memory.enabled).toBe(false)
  await extract.waitFor({ state: 'hidden' })
  expect(scaffold.ctx.memory.records()).toHaveLength(1)
  const shots = fileURLToPath(new URL('../../../.artifacts/screenshots/memory', import.meta.url))
  await mkdir(shots, { recursive: true })
  await page.getByRole('button', { name: '管理记忆', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '跨对话记忆', exact: true })
  await manager.getByText('使用简体中文', { exact: true }).first().waitFor()
  await manager.screenshot({ path: join(shots, 'manager.png') })
})
