/** Actual Web commands, context replacement, preference persistence and reconnect. */
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Route } from 'playwright'
import { expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { MockAdapter, textResponse } from '../../../packages/core/agent-loop/tests/mock-adapter.ts'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'

class SideFixtureAdapter extends MockAdapter {
  override listModels(provider: string) {
    return Promise.resolve([{ provider, id: 'mock', name: 'Side fixture', contextWindow: 128000 }])
  }
}

it('sends side images and clears only the side context', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)) })
  try {
    const png = await readFile(new URL('../../../snapshots/session/read-image/workspace/red.png', import.meta.url))
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
      const mode = page.getByRole('button', { name: /^Conversation mode:/u })
      await mode.hover()
      await page.getByRole('tooltip').filter({ hasText: 'Changing the mode of an existing conversation is off' }).waitFor()
      expect(await mode.getAttribute('title')).toBeNull()

      const dock = page.locator('[data-composer-dock]').first()
      await page.setViewportSize({ width: 390, height: 844 })
      const cost = dock.getByRole('button', { name: /^Conversation cost:/u })
      const limit = dock.getByRole('button', { name: /^Spending limits:/u })
      await cost.waitFor()
      await limit.waitFor()
      expect(await dock.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      const costBox = await cost.boundingBox(), limitBox = await limit.boundingBox()
      expect(costBox?.y).toBe(limitBox?.y)
      await cost.press('Enter')
      await page.getByRole('dialog', { name: 'Conversation cost' }).waitFor()
      await page.keyboard.press('Escape')
      await limit.press('Enter')
      await page.getByRole('dialog', { name: 'Spending limits' }).waitFor()
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 1280, height: 900 })

      await mainInput.fill('/side OLD_SIDE_732')
      await page.locator('[data-composer-card] input[type=file]').first().setInputFiles({ name: 'command.png', mimeType: 'image/png', buffer: png })
      await page.getByRole('img', { name: 'command.png' }).waitFor()
      await page.locator('button[aria-busy="false"]', { has: page.getByRole('img', { name: 'command.png' }) }).waitFor()
      await mainInput.press('Enter')
      const side = page.locator('[data-aside="side"]:visible')
      await side.getByText('Side fixture answer', { exact: true }).waitFor()
      const clearHistory = side.getByRole('button', { name: 'Clear conversation history', exact: true })
      await expect.poll(() => clearHistory.isEnabled()).toBe(true)
      await mkdir(fileURLToPath(new URL('../../../.artifacts/screenshots/side-clear-history', import.meta.url)), { recursive: true })
      await side.screenshot({ path: fileURLToPath(new URL('../../../.artifacts/screenshots/side-clear-history/panel.png', import.meta.url)) })
      const commandRequest = adapter.requests.findLast(request => JSON.stringify(request.messages).includes('OLD_SIDE_732'))
      const commandImage = commandRequest?.messages.flatMap(message => message.content).find(part => part.type === 'image')
      if (commandImage?.type !== 'image') throw new Error('Side command did not deliver an image to the adapter')
      expect(commandImage.attachment.name).toBe('command.png')
      expect(Buffer.from((await scaffold.ctx.attachments.readImage(commandImage.attachment)).data)).toEqual(png)
      const sideInput = side.locator('[data-composer-input][contenteditable="true"]')
      const reset = api.resetAside.bind(api)
      const publish = scaffold.ctx.events.dispatch.bind(scaffold.ctx.events)
      const resetEvent = vi.spyOn(scaffold.ctx.events, 'dispatch').mockImplementation((mode, args) =>
        args[0] === 'api-session/side-reset' ? [] : publish(mode, args))
      const resetReply = vi.spyOn(api, 'resetAside').mockImplementationOnce(async (request) => {
        await reset(request)
        throw new RemoteError('gateway/internal', 'fixture reset reply unavailable', {})
      })
      try {
        await sideInput.fill('/clear')
        await sideInput.press('Enter')
        await expect.poll(() => side.getByText('OLD_SIDE_732', { exact: true }).count()).toBe(0)
        expect(resetReply).toHaveBeenCalledOnce()
      } finally { resetReply.mockRestore(); resetEvent.mockRestore() }
      await sideInput.waitFor()
      await sideInput.fill('NEW_SIDE_593')
      await sideInput.evaluate((surface, bytes) => {
        const clipboardData = new DataTransfer()
        clipboardData.items.add(new File([new Uint8Array(bytes)], 'side.png', { type: 'image/png' }))
        surface.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
      }, [...png])
      await side.getByRole('img', { name: 'side.png' }).waitFor()
      await side.locator('button[aria-busy="false"]', { has: page.getByRole('img', { name: 'side.png' }) }).waitFor()
      await sideInput.press('Enter')
      await side.getByText('Side fixture answer', { exact: true }).waitFor()
      const freshRequest = adapter.requests.findLast(request => JSON.stringify(request.messages).includes('NEW_SIDE_593'))
      expect(JSON.stringify(freshRequest?.messages)).toContain('MAIN_CONTEXT_265')
      expect(JSON.stringify(freshRequest?.messages)).not.toContain('OLD_SIDE_732')
      expect(freshRequest?.messages.flatMap(message => message.content).filter(part => part.type === 'image').map(part => part.attachment.name))
        .toEqual(['side.png'])
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
      const routePattern = '**/api/session/aside'
      let opening: Route | undefined
      const delay = async (route: Route): Promise<void> => {
        if (opening === undefined) opening = route
        else await route.continue()
      }
      await page.route(routePattern, delay)
      try {
        await page.reload()
        await expect.poll(() => opening !== undefined, { timeout: 5_000 }).toBe(true)
        await closeSide()
      } finally {
        try { await opening?.continue() }
        finally { await page.unroute(routePattern, delay) }
      }
      await expect.poll(async () => (await api.aside({ sessionId, kind: 'side' })).sessionId, { timeout: 5_000 }).toMatch(/-2$/u)
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

      const currentSide = await api.aside({ sessionId, kind: 'side' })
      const cleanup = vi.spyOn(scaffold.ctx.sessionQuery, 'forgetSessions').mockRejectedValueOnce(new Error('fixture cleanup interruption'))
      const dispatch = scaffold.ctx.events.dispatch.bind(scaffold.ctx.events)
      const notifications = vi.spyOn(scaffold.ctx.events, 'dispatch').mockImplementation((mode, args) =>
        args[0] === 'api-session/deleted' ? [] : dispatch(mode, args))
      try {
        const row = page.locator(`[data-row-key="session:${sessionId}"]`)
        await row.hover()
        await row.getByRole('button', { name: 'Session actions for Side cleanup fixture' }).click()
        await page.getByRole('menuitem', { name: 'Delete conversation', exact: true }).click()
        const deletion = page.getByRole('dialog', { name: 'Delete conversation?' })
        await deletion.getByRole('button', { name: 'Stop and delete', exact: true }).click()
        await deletion.getByRole('alert').filter({ hasText: 'Some cleanup remains.' }).waitFor()
        expect(await scaffold.ctx.sessionPersistence.stat(sessionId)).toBeUndefined()
        expect(await scaffold.ctx.sessionPersistence.stat(currentSide.sessionId)).toBeUndefined()
        await page.getByRole('tab').filter({ hasText: 'Side question' }).waitFor({ state: 'detached', timeout: 5_000 })
        await row.waitFor({ state: 'detached', timeout: 5_000 })
        await deletion.getByRole('button', { name: 'Retry', exact: true }).click()
        await deletion.waitFor({ state: 'hidden' })
        await page.getByRole('alert').filter({ hasText: 'Conversation deleted' }).waitFor()
        expect(workspace.sessionIds).not.toContain(sessionId)
      } finally {
        notifications.mockRestore()
        cleanup.mockRestore()
      }
    } finally { await browser.close() }
  } finally { await scaffold.close() }
})
