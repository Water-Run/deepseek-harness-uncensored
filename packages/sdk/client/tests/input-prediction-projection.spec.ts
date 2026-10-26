/** SDK audit projection paired with the Session Controller's real request and persistence tests. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { createProcessDeepSeekHarness } from '../src/api.ts'

const fakeRuntime = fileURLToPath(new URL('./fake-runtime.ts', import.meta.url))

function isAudit(value: unknown, types: Set<string>): value is { type: string } {
  return value !== null && typeof value === 'object' && 'type' in value && typeof value.type === 'string' && types.has(value.type)
}

it.each(['input-prediction-projection.json', 'memory-extraction-projection.json'])(
  'preserves %s audit data without turning it into submitted conversation text', async (fixture) => {
    const expectedPath = fileURLToPath(new URL(`./expected/${fixture}`, import.meta.url))
    const expected = JSON.parse(await readFile(expectedPath, 'utf8')) as { finalResponse: string; auditEvents: { type: string }[] }
    const types = new Set(expected.auditEvents.map(event => event.type))
    const harness = createProcessDeepSeekHarness({ command: process.execPath, args: [fakeRuntime],
      environment: () => ({ ...process.env, FAKE_TEXT: expected.finalResponse, FAKE_SESSION_EVENTS: JSON.stringify(expected.auditEvents) }),
      description: 'scripted SDK prediction audit', initializeTimeoutMs: 5000,
    })
    try {
      const result = await harness.run('Keep the original response.')
      expect({
        finalResponse: result.finalResponse,
        auditEvents: result.events.filter(event => isAudit(event, types)),
        auditNotifications: result.notifications.filter(notification => notification.method === 'session.event'
        && isAudit(notification.params.event, types)).map((notification) => {
          if (notification.method !== 'session.event') throw new Error('Expected a Session event notification')
          expect(notification.params.sessionId).toBe(result.sessionId)
          return { method: notification.method, event: notification.params.event }
        }),
        assistantTexts: result.events.filter(event => event.type === 'assistant/message')
          .flatMap(event => event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : [])),
      }).toEqual(expected)
    } finally { await harness.close() }
  })
