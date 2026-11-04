/** Keyless egress from a real SDK-profile child process. */
import { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { startLocalTarget } from '../../../guard/security-proxy-local/tests/support/local-proxy.ts'
import { startExternalActivation } from '../../subagent/tests/external-activation-helpers.ts'
import { setupExternalProxy } from '../../subagent/tests/external-proxy-fixture.ts'
import { mountWorkingDirectoryFixture } from '../../subagent/tests/working-directory-fixture.ts'
import * as sdk from '../src/index.ts'

it('routes traffic from the shipped SDK profile through its parent session', async ({ onTestFinished }) => {
  const ctx = new Context()
  const home = await mkdtemp(join(tmpdir(), 'dsh-sdk-proxy-test-'))
  const target = await startLocalTarget('SDK child reached the local target')
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      try { await target.close() }
      finally { await rm(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }) }
    }
  })
  const patch = join(home, 'child.patch.yml')
  const fixture = new URL('./fixtures/loader/', import.meta.url)
  const config = await readFile(new URL('child.patch.yml', fixture), 'utf8')
  await writeFile(patch, config.replace("'./child-mock-llm.ts'", JSON.stringify(new URL('child-mock-llm.ts', fixture).href)))
  await ctx.plugin(SessionProjectionRegistry)
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  const remote = new URL(target.url)
  remote.hostname = '192.0.2.1'
  const { parent } = await setupExternalProxy(ctx, home, target.url, remote.host)
  await ctx.plugin(sdk, sdk.Config({
    providerName: 'sdk-fixture', profile: 'sdk', dshHome: home, patches: [patch],
    provider: 'mock', model: 'mock-routed', maxTokens: 777,
    initializeTimeoutMs: 30_000,
    env: { DSH_TEST_CHILD_PROXY_TARGET: remote.href, DSH_TELEMETRY_DISABLED: '1', no_proxy: '127.0.0.1' },
  }))
  const run = await startExternalActivation(ctx, 'sdk-fixture', {
    parent, prompt: [{ type: 'text', text: 'Fetch the local fixture' }],
    agentOptions: { reasoningEffort: ReasoningEffortId('max') }, signal: AbortSignal.timeout(45_000),
  })
  try {
    expect(await run.result).toMatchObject({
      output: [{ type: 'text', text: 'SDK child reached the local target' }], stopReason: 'completed',
    })
  } finally { await run.dispose() }
  const { flows } = await ctx.securityProxy.list({})
  expect(flows.some(flow => flow.sessionId === parent.id && flow.tool === 'subagent:sdk-fixture' && flow.responseBytes > 0)).toBe(true)
}, 60_000)
