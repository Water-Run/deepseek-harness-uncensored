/** Forked Web agents inherit the standard preset and refuse every reminder tool. */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { parseSessionLog, prepareSessionSnapshotFixtureForComparison } from '@deepseek-ai/dsh-llm-replay'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  fixtureContext, normalizeSessionSnapshots, normalizedSystemPrompts, normalizedToolSchemas,
  formatSystemPromptSnapshot, parseToolSchemasSnapshot, redactSessionSnapshotIds, refreshFixtureReplacements,
  scrubSessionSnapshot, stabilizeFixtureMessageIds, stabilizeRefreshLog, tokenizeSessionFixtureCwd, writerSnapshotName,
} from '@deepseek-ai/dsh-session-snapshot'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-schedule'
import type {} from '@deepseek-ai/dsh-subagent'
import {
  fixtureUserPrompts, launchWebScaffold, normalizeWebSessionVolatiles, rawSessionLog, readPersistedEvents,
  selectedSessionFixture, webSnapshotMode,
} from './scaffold.ts'
import { REPO_ROOT } from './support.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/subagent-fork-schedule', import.meta.url))
const PIN = join(DIR, '../fresh-round-trip')
const CHILD_PROMPT = join(DIR, 'child-system-prompt.expected.md')
const MODE = webSnapshotMode()

it.skipIf(MODE === 'record')('replays inherited schedule tools and refusals in a seeded Web fork', async () => {
  const paths = await Promise.all(['session.v4.jsonl', 'session.1.v4.jsonl']
    .map(file => selectedSessionFixture(join(DIR, file))))
  const inputs = await Promise.all(paths.map(path => readFile(path, 'utf8')))
  const outputs = paths.map((_, index) => join(DIR, writerSnapshotName(index)))
  let expected = await Promise.all(outputs.map(path => readFile(path, 'utf8')))
  const scaffold = await launchWebScaffold({
    replayFixture: paths[0]!, replayChildFixtures: [paths[1]!], compareReplaySession: false,
    replayOverride: join(DIR, 'replay.override.json'),
  })
  try {
    const sessions: Session[] = []
    scaffold.ctx.on('session/created', (session) => { sessions.push(session) })
    const { sessionId } = await scaffold.ctx.sessionController.create({ cwd: scaffold.workspaceCwd })
    const parent = scaffold.ctx.agents.get(sessionId)
    if (parent === undefined) throw new Error('created parent has no Agent')
    const prompt = fixtureUserPrompts(inputs[0]!)[0]
    if (prompt === undefined) throw new Error('parent fixture has no user prompt')
    parent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
    await parent.whenIdle()

    const childPrompt = parseSessionLog(inputs[1]!).findLast(event => event.type === 'user/message'
      && event.data.source.kind === 'user')
    if (childPrompt?.type !== 'user/message') throw new Error('child fixture has no user prompt')
    const activation = await scaffold.ctx.subagents.startActivation({
      provider: 'fork', label: 'Check child reminder refusal', delivery: 'caller',
      signal: new AbortController().signal,
      parent, prompt: [...childPrompt.data.content],
    })
    try {
      await activation.result
    } finally {
      await activation.dispose()
    }
    await scaffold.ctx.sessions.flush(parent.session)
    expect(sessions).toHaveLength(2)
    const child = sessions[1]!
    expect(child.header).toMatchObject({ parentSession: parent.id, isSeeded: true, agentPreset: 'standard' })
    expect(child.inheritedEventCount).toBeGreaterThan(0)
    const parentHeader = parent.session.requestHeader()
    if (parentHeader?.tools === undefined) throw new Error('Parent request has no tool schemas')
    expect(parentHeader.tools.some(tool => tool.name === 'read_side_context')).toBe(true)
    const childTools = parentHeader.tools.filter(tool => tool.name !== 'read_side_context')
    const inheritedHeader = child.snapshotEvents().slice(0, child.inheritedEventCount)
      .findLast(event => event.type === 'request/header')
    expect(inheritedHeader).toMatchObject({ data: { header: parentHeader } })
    expect(child.requestHeader()).toEqual({ ...parentHeader, tools: childTools })

    for (const session of sessions) {
      expect(await readPersistedEvents(scaffold, session.id)).toEqual(session.snapshotEvents())
    }
    const raw = sessions.map(session => normalizeWebSessionVolatiles(rawSessionLog(session), scaffold.workspaceCwd))
    const context = { sessionIds: sessions.map(session => String(session.id)), cwd: scaffold.workspaceCwd }
    const schemas = parseToolSchemasSnapshot(await readFile(join(PIN, 'tool-schemas.expected.json'), 'utf8'))
    const childSchemaPin = schemas.initial.filter(tool => typeof tool !== 'object' || tool === null
      || !('name' in tool) || tool.name !== 'read_side_context')
    const promptPin = await readFile(join(PIN, 'system-prompt.expected.md'), 'utf8')
    for (const [sessionIndex, log] of raw.entries()) {
      const headers = normalizedToolSchemas(log, context)
      expect(headers.length).toBeGreaterThan(0)
      for (const [headerIndex, tools] of headers.entries()) {
        expect(tools).toEqual(sessionIndex === 1 && headerIndex > 0 ? childSchemaPin : schemas.initial)
      }
      const prompts = normalizedSystemPrompts(log, context)
      expect(prompts).toHaveLength(sessionIndex === 1 ? 2 : 1)
      for (const [promptIndex, prompt] of prompts.entries()) {
        const formatted = formatSystemPromptSnapshot(prompt.split(REPO_ROOT).join('{{sourceRoot}}')
          .split(scaffold.baseUrl).join('{{webUrl}}'))
        const childOwned = sessionIndex === 1 && promptIndex > 0
        if (childOwned && MODE === 'refresh') await writeFile(CHILD_PROMPT, formatted)
        expect(formatted).toBe(childOwned ? await readFile(CHILD_PROMPT, 'utf8') : promptPin)
      }
    }
    const ownEvents = child.snapshotEvents().slice(child.inheritedEventCount)
    expect(ownEvents.some(event => event.type === 'agent-preset/selected')).toBe(false)
    const results = ownEvents.filter(event => event.type === 'tool/result')
    expect(ownEvents.filter(event => event.type === 'tool/call').map(event => event.data.name))
      .toEqual(['schedule_create', 'schedule_list', 'schedule_view', 'schedule_edit', 'schedule_edit'])
    expect(results.map(event => event.data.message.content)).toEqual(Array.from({ length: 5 }, () => [
      { type: 'text', text: '{"code":"subagent_session","message":"A delegated subagent cannot use scheduled tasks."}' },
    ]))
    expect((await scaffold.ctx.schedule.list({ active: true })).items).toEqual([])

    if (MODE === 'refresh') {
      const replacements = refreshFixtureReplacements(raw.map((content, index) => ({
        id: sessions[index]!.id, createdAt: sessions[index]!.header.createdAt, content,
      })), expected)
      expected = redactSessionSnapshotIds(stabilizeFixtureMessageIds(raw.map((log, index) =>
        tokenizeSessionFixtureCwd(scrubSessionSnapshot(stabilizeRefreshLog(
          prepareSessionSnapshotFixtureForComparison(log), expected[index]!, replacements, context,
        ))).split(scaffold.harnessHome).join('{{harnessHome}}')), expected))
      await Promise.all(expected.map((log, index) => writeFile(
        outputs[index]!, log,
      )))
    }
    expect(normalizeSessionSnapshots(raw, context))
      .toEqual(normalizeSessionSnapshots(expected, fixtureContext(expected[0]!)))
  } finally {
    await scaffold.close()
  }
})
