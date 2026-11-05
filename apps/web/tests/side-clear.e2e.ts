/** Actual Web commands, context replacement, preference persistence and reconnect. */
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { MockAdapter, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

class SideFixtureAdapter extends MockAdapter {
  override listModels(provider: string) {
    return Promise.resolve([{ provider, id: 'mock', name: 'Side fixture', contextWindow: 128000 }])
  }
}

it('clears only the side context and makes actual tab-close cleanup opt-in', async () => {
  const scaffold = await launchWebScaffold()
  try {
    const adapter = new SideFixtureAdapter(Array.from({ length: 30 }, () => textResponse('Side fixture answer')))
    scaffold.ctx.llm.registerAdapter(['side-clear-fixture'], adapter)
    const api = scaffold.ctx.sessionController
    const { sessionId } = await api.create({ cwd: scaffold.workspaceCwd })
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    await workspace.setTitle('Side fixture workspace')
    await workspace.attachSession(sessionId)
    await api.rename({ sessionId, title: 'Side cleanup fixture' })
    await api.selectModel({ sessionId, provider: 'side-clear-fixture', model: 'mock' })
    const main = scaffold.ctx.agents.get(sessionId)!
    main.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'MAIN_CONTEXT_265' }] }))
    await main.whenIdle()
    const before = main.session.snapshotEvents()
    const historyBefore = main.session.deriveMessages()
    const browser = await chromium.launch()
    try {
      const page = await newEnglishPage(browser), console = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl)
      const group = page.getByRole('treeitem').filter({ has: page.getByText('Side fixture workspace', { exact: true }) })
      await group.waitFor()
      if (await group.getAttribute('aria-expanded') === 'false') await group.press('ArrowRight')
      await page.getByRole('treeitem').filter({ hasText: 'Side cleanup fixture' }).click()
      const mainInput = page.locator('[data-composer-input][contenteditable="true"]:visible').first()
      await mainInput.fill('/side OLD_SIDE_732')
      await mainInput.press('Enter')
      const side = page.locator('[data-aside="side"]:visible')
      await side.getByText('Side fixture answer', { exact: true }).waitFor()
      const sideInput = side.locator('[data-composer-input][contenteditable="true"]')
      await sideInput.fill('/clear')
      await sideInput.press('Enter')
      await expect.poll(() => side.getByText('OLD_SIDE_732', { exact: true }).count()).toBe(0)
      await sideInput.waitFor()
      await sideInput.fill('NEW_SIDE_593')
      await sideInput.press('Enter')
      await side.getByText('Side fixture answer', { exact: true }).waitFor()
      const freshRequest = adapter.requests.findLast(request => JSON.stringify(request.messages).includes('NEW_SIDE_593'))
      expect(JSON.stringify(freshRequest?.messages)).toContain('MAIN_CONTEXT_265')
      expect(JSON.stringify(freshRequest?.messages)).not.toContain('OLD_SIDE_732')
      const closeSide = async (): Promise<void> => {
        await page.getByRole('tab').filter({ hasText: 'Side question' }).locator('[data-dockkit-tab-close]').click()
        await expect.poll(() => side.count()).toBe(0)
      }
      await closeSide()
      await mainInput.fill('/side')
      await mainInput.press('Enter')
      await side.getByText('NEW_SIDE_593', { exact: true }).waitFor()
      await page.reload()
      await side.getByText('NEW_SIDE_593', { exact: true }).waitFor()
      await openSettings(page, 'en')
      const settings = page.getByRole('dialog', { name: 'Settings' })
      const toggle = settings.getByRole('switch', { name: 'Clear side context when closed', exact: true })
      await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
      await toggle.click()
      await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true')
      await page.keyboard.press('Escape')
      await settings.waitFor({ state: 'hidden' })
      await closeSide()
      await expect.poll(async () => (await api.aside({ sessionId, kind: 'side' })).sessionId).toMatch(/-2$/u)
      await mainInput.fill('/side')
      await mainInput.press('Enter')
      await sideInput.waitFor()
      await expect.poll(() => side.getByText('NEW_SIDE_593', { exact: true }).count()).toBe(0)
      await page.reload()
      await sideInput.waitFor()
      await expect.poll(() => side.getByText('NEW_SIDE_593', { exact: true }).count()).toBe(0)
      expect(main.session.deriveMessages()).toEqual(historyBefore)
      expect(main.session.snapshotEvents().slice(before.length).filter(event => event.type !== 'input/prediction')).toEqual([])
      expect(console.pageErrors).toEqual([])
      expect(console.warnings).toEqual([])
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
