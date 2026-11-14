/** Four-mode selection, opt-in changes to existing conversations, and optional Creator navigation without model calls. */
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  SESSION_FORMAT_VERSION, SessionId as sessionId, type SessionEvent, type SessionHeader, type SessionId,
} from '@deepseek-ai/dsh-session'
import { SUBAGENT_DESCRIPTOR_VERSION } from '@deepseek-ai/dsh-subagent'
import { createSystemMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openPluginManager, openSettings,
  connectFreshWorkspace, newConversationReplayPage, saveFailureShot, writeComposerDraft,
} from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/agent-preset-selection', import.meta.url))
const HERO_EXPECTED = join(SNAPSHOT_DIR, 'hero.expected.md')
const MENU_EXPECTED = join(SNAPSHOT_DIR, 'menu.expected.md')
const HEADER_EXPECTED = join(SNAPSHOT_DIR, 'header.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'agent-preset-selection-web-e2e'
const SEED_TIME = 1784974100000
const SEEDED_CHILD_ID = sessionId('agent-preset-selection-child')
const SEEDED_CHILD_CREATED_AT = 1784974100100
/** A project skill only a preset that mounts `skill-filesystem` can discover. */
const SKILL_NAME = 'preset-catalog-demo'
/** The preset whose rows resolve and then refuse to start. */
const REFUSING_ID = 'zz-refusing'

/** Write the fixture module whose declaration fails during eager activation.
 * @param root Temporary directory holding the fixture module.
 */
async function seedRefusingPreset(root: string): Promise<void> {
  const directory = join(root, REFUSING_ID)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'refuses.mjs'),
    'export const name = \'refuses\'\nexport function apply() { throw new Error(\'this row refuses to start\') }\n')

}

/**
 * Seed one project skill under the connected workspace.
 *
 * Local skill discovery is a PRESET row, so this file is visible through
 * `standard` and invisible through `minimal` — which makes the '/' menu's
 * skill group a statement about the session's composition.
 * @param workspaceCwd - the scaffold's temp project parent.
 */
async function seedWorkspaceSkill(workspaceCwd: string): Promise<void> {
  const directory = join(workspaceCwd, 'workspace', '.agents', 'skills', SKILL_NAME)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), [
    '---',
    `name: ${SKILL_NAME}`,
    'description: Prove the slash catalog follows the session composition',
    '---',
    '',
    'Body.',
    '',
  ].join('\n'))
}

/**
 * A settled one-turn session with no model content: this lane asserts chrome
 * around a conversation, not a conversation, and a recorded turn would tie
 * the golden to a provider's wording for no gain. Its empty system head
 * belongs to the first step, before the user message.
 * @returns a tokenized session log ending on a closed turn.
 */
function seedLog(): string {
  const at = (index: number, event: Record<string, unknown>): string =>
    JSON.stringify({ ...event, seq: index, time: SEED_TIME + index })
  return [
    JSON.stringify({
      type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}',
      createdAt: SEED_TIME, cwd: '{{cwd}}/workspace', isSeeded: false, delegationDepth: 0,
    }),
    at(0, { type: 'turn/start', data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user', rpcId: 'seed' } } } }),
    at(1, { type: 'step/start', data: { turn: 1, step: 1 } }),
    at(2, {
      type: 'system/message',
      data: { turn: 1, step: 1, message: createSystemMessage('') },
      surfaceOp: 'append',
    }),
    at(3, {
      type: 'user/message',
      data: {
        id: '00000000-0000-4000-9000-000000000001',
        role: 'user',
        content: [{ type: 'text', text: 'Seeded turn.' }],
        source: { kind: 'user', rpcId: 'seed' },
      },
      surfaceOp: 'append',
    }),
    at(4, { type: 'session/title', data: { title: 'Seeded turn', messageSeqs: [3], source: { kind: 'fallback' } } }),
    at(5, { type: 'step/end', data: { turn: 1, step: 1 } }),
    at(6, {
      type: 'subagent/catalog',
      data: {
        version: 0,
        childId: SEEDED_CHILD_ID,
        childCreatedAt: SEEDED_CHILD_CREATED_AT,
        mode: 'one-shot',
        label: 'header order probe',
      },
    }),
    at(7, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }),
  ].join('\n')
}

/**
 * Persist one child so the assembled header snapshot exercises both action
 * contributors whose relative order is the product contract under test.
 * @param scaffold - the booted Web scaffold.
 * @param parentId - the seeded session whose header the browser opens.
 */
async function seedSubagent(scaffold: WebScaffold, parentId: SessionId): Promise<void> {
  const header: SessionHeader = {
    version: SESSION_FORMAT_VERSION,
    id: SEEDED_CHILD_ID,
    isSeeded: false,
    createdAt: SEEDED_CHILD_CREATED_AT,
    cwd: scaffold.workspaceCwd,
    parentSession: parentId,
    origin: 'subagent',
    delegationDepth: 1,
    agentPreset: 'minimal',
  }
  const handle = await scaffold.ctx.sessionPersistence.create(header)
  await handle.append([
    {
      type: 'turn/start',
      seq: 0,
      time: SEEDED_CHILD_CREATED_AT,
      data: { turn: 1, trigger: { kind: 'message', source: { kind: 'user' } } },
    },
    {
      type: 'user/message',
      seq: 1,
      time: SEEDED_CHILD_CREATED_AT + 1,
      data: createUserMessage({
        content: [{ type: 'text', text: 'Check the session-header action order.' }],
        source: { kind: 'user' },
      }),
      surfaceOp: 'append',
    },
    {
      type: 'subagent/descriptor',
      seq: 2,
      time: SEEDED_CHILD_CREATED_AT + 2,
      data: {
        version: SUBAGENT_DESCRIPTOR_VERSION,
        mode: 'one-shot', provider: 'spawn', label: 'header order probe',
      },
    },
    {
      type: 'turn/end',
      seq: 3,
      time: SEEDED_CHILD_CREATED_AT + 3,
      data: { turn: 1, reason: { kind: 'completed' } },
    },
  ] as SessionEvent[])
  await handle.close()
}

/**
 * The preset the host reports for the blank session the workspace connect
 * produced. Addressed by id rather than by scanning the serialized list: the
 * seeded session records `minimal` too, so a substring match over the whole
 * list answers before the switch has landed.
 * @param scaffold - authenticated Web Host scaffold.
 * @param targetId - exact Session to inspect after several Sessions have been created.
 * @returns the live session's preset, or undefined before it is listed.
 */
async function livePreset(scaffold: WebScaffold, targetId?: SessionId): Promise<string | undefined> {
  const response = await scaffold.hostFetch('/api/session/list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId: 'agent-preset-live', method: 'session/list',
      payload: { args: { _request: {} } },
    }),
  })
  const body = await response.json() as {
    result: {
      value?: {
        items: {
          sessionId: string
          projections?: { values: { agentPreset?: string | null } }
        }[]
      }
    }
  }
  const preset = body.result.value?.items.find(item => targetId === undefined ? item.sessionId !== SEED_ID : item.sessionId === targetId)
    ?.projections?.values.agentPreset
  return typeof preset === 'string' ? preset : undefined
}

/** Every option label the trigger menu currently lists. */
async function menuOptions(page: Page): Promise<string[]> {
  const menu = page.getByRole('listbox', { name: 'Trigger suggestions' })
  await menu.waitFor({ timeout: 10_000 })
  return await menu.getByRole('option').allTextContents()
}

describe('web e2e: agent-preset selection', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let fixtureRoot: string

  beforeAll(async () => {
    // The failed declaration remains in the registry, outside the selectable options.
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'dsh-web-e2e-refusing-')))
    await seedRefusingPreset(fixtureRoot)
    scaffold = await launchWebScaffold({
      agentPresets: { default: 'standard', definitions: [{ id: REFUSING_ID, name: 'Refusing mode', description: 'Refuses to start.', plugins: [{ name: pathToFileURL(join(fixtureRoot, REFUSING_ID, 'refuses.mjs')).href }] }] },
    })
    // A resumed session runs what it was created with; seeding one that
    // records `minimal` is what makes the header label a claim about the
    // session rather than an echo of the current default.
    const seededId = await seedSession(scaffold, seedLog(), SEED_ID, 'minimal')
    await seedSubagent(scaffold, seededId)
    await seedWorkspaceSkill(scaffold.workspaceCwd)
    browser = await chromium.launch()
    page = await newConversationReplayPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await rm(fixtureRoot, { recursive: true, force: true })
  })

  it('lists the four shipped modes and keeps hidden or broken presets out of selection', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-menu'))
    expect(await livePreset(scaffold)).toBeUndefined()
    await page.getByRole('button', { name: 'Default', exact: true }).click()
    await page.getByRole('menu').waitFor()
    const snapshot = await captureStableAria(page, '[role="menu"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MENU_EXPECTED, snapshot, MODE)
    expect(await page.getByRole('menuitem').count()).toBe(4)
    for (const label of ['Default', 'Security', 'Reverse engineering', 'Writing']) expect(snapshot).toContain(label)
    for (const label of ['Minimal mode', 'PTC mode', 'Creator mode', 'Refusing mode']) expect(snapshot).not.toContain(label)
    expect((await scaffold.ctx.agentPresets.resolve(REFUSING_ID)).broken).toContain('this row refuses to start')
    await page.keyboard.press('Escape')
  })

  it('applies a staged Writing choice to the first blank conversation without changing the default', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-hero'))
    await page.getByRole('button', { name: 'Default', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Writing/ }).click()
    await page.getByRole('button', { name: 'Writing', exact: true }).waitFor()
    expect(await livePreset(scaffold)).toBeUndefined()
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    await expect.poll(() => livePreset(scaffold)).toBe('writing')
    expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')
    const snapshot = await captureStableAria(page, '[class*="heroWorkspaceRow"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(HERO_EXPECTED, snapshot, MODE)
    expect(snapshot).toContain('Writing')
  })

  it('recomposes a blank conversation and refreshes its slash catalog', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-slash-catalog'))
    await page.getByRole('button', { name: 'Writing', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Default/ }).click()
    await expect.poll(() => livePreset(scaffold)).toBe('standard')
    const draft = scaffold.ctx.agents.list().find(agent => agent.id !== SEED_ID && agent.id !== SEEDED_CHILD_ID)
    if (draft === undefined) throw new Error('The workspace draft is missing')
    expect(scaffold.ctx.agentPresets.composedPreset(draft.ctx)).toBe('standard')
    const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
    await writeComposerDraft(page, composer, '/')
    await expect.poll(() => menuOptions(page)).toEqual(expect.arrayContaining([expect.stringContaining(SKILL_NAME)]))
    const options = (await menuOptions(page)).map(option => option.toLowerCase())
    for (const command of ['compact', 'goal', 'plan', 'model']) expect(options.some(option => option.startsWith(command))).toBe(true)
    await writeComposerDraft(page, composer, '')
  })

  it('selects a blank mode from Settings while new conversations keep the Default preset', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-settings'))
    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Modes', exact: true }).click()
    await settings.getByRole('button', { name: 'Select mode: Writing', exact: true }).click()
    await expect.poll(() => livePreset(scaffold)).toBe('writing')
    expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')
    expect(await settings.getByRole('switch', { name: 'Allow mode changes in existing conversations', exact: true }).getAttribute('aria-checked')).toBe('false')
    await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
    const [response] = await Promise.all([
      page.waitForResponse('**/api/session/create'),
      page.getByRole('button', { name: 'New session', exact: true }).last().click(),
    ])
    expect(await response.json()).toMatchObject({ result: { ok: true, value: { agentPreset: 'standard' } } })
    await page.getByRole('button', { name: 'Default', exact: true }).waitFor()
  })

  it('restores a hidden historical mode and explains why its header cannot switch', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-header'))
    const group = page.getByRole('treeitem', { name: /^Ungrouped/ })
    await group.click()
    await page.locator(`[data-row-key="session:${SEED_ID}"]`).click()
    await page.getByText('Seeded turn.', { exact: true }).waitFor()
    const snapshot = await captureStableAria(page, '[class*="titleRow"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(HEADER_EXPECTED, snapshot, MODE)
    expect(snapshot).toContain('Minimal mode')
    expect(snapshot).toContain('button "1 subagent"')
    expect(snapshot.indexOf('Minimal mode')).toBeLessThan(snapshot.indexOf('button "1 subagent"'))
    expect(snapshot.indexOf('button "1 subagent"')).toBeLessThan(snapshot.indexOf('button "More actions"'))
    const badge = page.getByRole('button', { name: 'Conversation mode: Minimal mode', exact: true })
    expect(await badge.getAttribute('aria-disabled')).toBe('true')
    expect(await badge.getAttribute('aria-haspopup')).toBeNull()
    await badge.hover()
    await page.getByRole('tooltip').filter({ hasText: 'Changing the mode of an existing conversation is off.' }).waitFor()
    expect(await page.getByRole('menu').count()).toBe(0)
    const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
    await writeComposerDraft(page, composer, '/')
    const options = (await menuOptions(page)).map(option => option.toLowerCase())
    expect(options.some(option => option.includes(SKILL_NAME))).toBe(false)
    expect(options.some(option => option.startsWith('compact'))).toBe(true)
    expect(options.some(option => option.startsWith('model'))).toBe(true)
    expect(options.some(option => option.startsWith('plan') || option.startsWith('goal'))).toBe(false)
    await writeComposerDraft(page, composer, '')
  })

  it('refuses a locked mode change in Settings and shows feedback without losing history', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-lock'))
    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Modes', exact: true }).click()
    const lockedChoice = settings.getByRole('button', { name: 'Select mode: Writing', exact: true })
    expect(await lockedChoice.getAttribute('aria-disabled')).toBe('true')
    await lockedChoice.focus()
    await lockedChoice.press('Enter')
    await settings.getByRole('alert').filter({ hasText: 'The mode was not changed' }).waitFor()
    expect(await livePreset(scaffold, sessionId(SEED_ID))).toBe('minimal')
    await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
    await page.getByText('Seeded turn.', { exact: true }).waitFor()
  })

  it('switches an idle existing conversation only after explicit confirmation and records the selection', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-agent-preset-confirm'))
    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Modes', exact: true }).click()
    await settings.getByRole('switch', { name: 'Allow mode changes in existing conversations', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Allow mode changes in existing conversations?', exact: true })
    await confirmation.getByRole('button', { name: 'Allow for this launch', exact: true }).click({ timeout: 15_000 })
    await confirmation.waitFor({ state: 'detached' })
    await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
    const badge = page.getByRole('button', { name: 'Conversation mode: Minimal mode', exact: true })
    expect(await badge.getAttribute('aria-haspopup')).toBe('menu')
    await badge.click()
    await page.getByRole('menuitem', { name: 'Writing', exact: true }).click()
    await expect.poll(() => livePreset(scaffold, sessionId(SEED_ID))).toBe('writing')
    const agent = scaffold.ctx.agents.get(sessionId(SEED_ID))
    if (agent === undefined) throw new Error('The resumed conversation is missing')
    expect(scaffold.ctx.agentPresets.composedPreset(agent.ctx)).toBe('writing')
    expect(agent.session.header.agentPreset).toBe('minimal')
    expect(agent.session.snapshotEvents().filter(event => event.type === 'agent-preset/selected')).toEqual([
      expect.objectContaining({ data: { agentPreset: 'writing' } }),
    ])
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message')).toHaveLength(1)
    await scaffold.ctx.sessions.flush(agent.session)
    await page.getByText('Seeded turn.', { exact: true }).waitFor()
  })

  it('disables further changes immediately while preserving the selected mode', async () => {
    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Modes', exact: true }).click()
    await settings.getByRole('switch', { name: 'Allow mode changes in existing conversations', exact: true }).click()
    await settings.getByRole('button', { name: 'Close', exact: true }).last().click()
    const badge = page.getByRole('button', { name: 'Conversation mode: Writing', exact: true })
    await expect.poll(() => badge.getAttribute('aria-disabled')).toBe('true')
    expect(await livePreset(scaffold, sessionId(SEED_ID))).toBe('writing')
    expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')
  })

  it('drove every surface without a page error or a stream warning', () => {
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})

it.each([false, true])('starts Creator from Plugins with Coding Tools=%s without changing drafts or defaults', async (developerTools) => {
  const scaffold = await launchWebScaffold({ developerTools, agentPresets: { default: 'standard', definitions: [{
    id: 'cordis', name: 'Creator mode', description: 'Optional plugin-authoring composition.', plugins: [
      { name: '@deepseek-ai/dsh-persona', config: { prefix: 'Author plugins with the available runtime tools.' } },
      { name: '@deepseek-ai/dsh-tool-cordis' },
      { name: '@deepseek-ai/dsh-plugin-manager/tools' },
    ],
  }] } })
  let browser: Browser | undefined
  try {
    expect((await scaffold.ctx.agentPresets.resolve('cordis')).broken).toBeUndefined()
    browser = await chromium.launch()
    const page = await newConversationReplayPage(browser)
    const tripwire = watchConsole(page)
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-creator'))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const standard = scaffold.ctx.agents.list()[0]
    if (standard === undefined) throw new Error('Connecting the workspace did not create a Session')
    expect(scaffold.ctx.agentPresets.composedPreset(standard.ctx)).toBe('standard')
    await page.getByRole('button', { name: 'Default', exact: true }).waitFor()
    const composerOf = (sessionId: SessionId) =>
      page.locator(`[data-conversation-session="${sessionId}"] [data-composer-input][contenteditable="true"]`)
    const draft = 'Keep this unsent plugin idea.'
    await writeComposerDraft(page, composerOf(standard.id), draft)

    await openPluginManager(page, 'en')
    await page.getByRole('button', { name: 'Choose how to add a plugin', exact: true }).click()
    // The draft's blank lists Standard, so the Creator entry names no blank and the Host creates a separate Creator Session.
    const [creation] = await Promise.all([
      page.waitForResponse('**/api/session/create'),
      page.getByRole('menuitem', { name: /^Let the agent create a plugin/ }).click(),
    ])
    expect(creation.request().postDataJSON()).toHaveProperty('payload.args.request.agentPreset', 'cordis')
    expect(creation.request().postDataJSON()).not.toHaveProperty('payload.args.request.sessionId')
    const creationBody = await creation.json() as { result: { ok: boolean; value: { sessionId: SessionId; agentPreset: string } } }
    expect(creationBody).toMatchObject({ result: { ok: true, value: { agentPreset: 'cordis' } } })
    const creator = scaffold.ctx.agents.get(creationBody.result.value.sessionId)
    if (creator === undefined) throw new Error('The Creator entry did not publish its Session')
    expect(creator.id).not.toBe(standard.id)
    const picker = page.getByTitle('Choose the agent preset for your new task', { exact: true }).filter({ hasText: 'Creator mode' })
    await picker.waitFor()
    await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor({ state: 'detached', timeout: 5000 })
    const creatorComposer = composerOf(creator.id)
    await creatorComposer.waitFor()
    await expect.poll(() => creatorComposer.evaluate(element => element.contains(document.activeElement))).toBe(true)
    expect((await creatorComposer.innerText()).trim()).toBe(draft)
    expect(await picker.getAttribute('aria-haspopup')).toBe('menu')
    expect(await page.getByRole('dialog', { name: 'Add plugin', exact: true }).count()).toBe(0)
    expect(creator.session.header.agentPreset).toBe('cordis')
    expect(scaffold.ctx.sessionProjections.checkpoint(creator.session).agentPreset?.val).toBe('cordis')
    expect(scaffold.ctx.agentPresets.composedPreset(creator.ctx)).toBe('cordis')
    expect(scaffold.ctx.tools.schemas(creator).map(tool => tool.name))
      .toEqual(expect.arrayContaining(['cordis_inspect_list', 'cordis_inspect_query', 'plugin_manager']))
    // The Session starts under Creator; a chip selection after the list updates records no switch.
    expect(creator.session.snapshotEvents().filter(event => event.type === 'agent-preset/selected')).toEqual([])
    expect(creator.session.snapshotEvents().some(event => event.type === 'user/message' || event.type === 'turn/start')).toBe(false)
    // The draft's blank keeps its preset and starts no turn.
    expect(scaffold.ctx.sessionProjections.checkpoint(standard.session).agentPreset?.val).toBe('standard')
    expect(scaffold.ctx.agentPresets.composedPreset(standard.ctx)).toBe('standard')
    expect(standard.session.snapshotEvents().some(event => event.type === 'agent-preset/selected'
      || event.type === 'user/message' || event.type === 'turn/start')).toBe(false)
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings')?.value).toMatchObject({ enabled: developerTools })
    expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')

    // Close a fixture turn on the real Creator Session without requesting a model.
    creator.session.append('turn/start', { turn: 1 })
    creator.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Creator fixture completed without a model call.' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    creator.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await scaffold.ctx.sessions.flush(creator.session)
    await page.getByText('Creator fixture completed without a model call.', { exact: true }).waitFor()
    // New Session returns to the Standard blank and its unsent draft.
    const newSession = page.getByRole('button', { name: 'New session', exact: true }).last()
    const [reopening] = await Promise.all([page.waitForResponse('**/api/session/create'), newSession.click()])
    expect(reopening.request().postDataJSON()).toHaveProperty('payload.args.request.sessionId', standard.id)
    expect(await reopening.json()).toMatchObject({ result: { ok: true, value: { sessionId: standard.id, agentPreset: 'standard' } } })
    await composerOf(standard.id).filter({ hasText: draft }).waitFor()
    expect(await composerOf(standard.id).innerText()).toBe(draft)
    const reopened = scaffold.ctx.agents.get(standard.id)
    if (reopened === undefined) throw new Error('New Session did not keep the Standard blank live')
    expect(reopened.session.header.agentPreset).toBe('standard')
    expect(scaffold.ctx.sessionProjections.checkpoint(reopened.session).agentPreset?.val).toBe('standard')
    expect(scaffold.ctx.agentPresets.composedPreset(reopened.ctx)).toBe('standard')
    expect(scaffold.ctx.sessionProjections.checkpoint(creator.session).agentPreset?.val).toBe('cordis')
    await page.getByRole('button', { name: 'Default', exact: true }).waitFor()
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings')?.value).toMatchObject({ enabled: developerTools })
    expect(scaffold.ctx.agentPresets.defaultId).toBe('standard')
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  } finally {
    await browser?.close()
    await scaffold.close()
  }
})
