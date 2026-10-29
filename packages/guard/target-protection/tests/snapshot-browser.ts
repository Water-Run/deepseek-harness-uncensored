/** Native Stagehand refusal through the shipped headless profile. @module */
import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as Stagehand from '@deepseek-ai/dsh-experimental-browser-use-stagehand-native'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import Protection from '../src/index.ts'
import TargetBrowserUse from '../src/browser.ts'

/** Cordis fixture name. */
export const name = 'browser-protection-snapshot'
/** The shipped tool, Agent and prompt services remain in use. */
export const inject = ['tools', 'agents', 'systemPrompt']

/** @param ctx - Dedicated snapshot owner. */
export async function apply(ctx: Context): Promise<void> {
  let connections = 0
  const server = createServer((_request, response) => { response.writeHead(404).end() })
  server.on('connection', () => { connections++ })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  let closeProvider = (): Promise<void> => Promise.resolve()
  ctx.effect(() => async () => {
    await closeProvider()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  }, 'browser-snapshot.listener')
  const address = server.address()
  assert.ok(address !== null && typeof address !== 'string')
  await ctx.plugin(Protection, { path: ':memory:', hostsFile: '' })
  await ctx.plugin(TargetBrowserUse)
  const provider = await ctx.plugin(Stagehand, { mode: 'attach', cdpEndpoint: `http://127.0.0.1:${String(address.port)}`,
    model: { modelName: 'openai/gpt-4.1-mini', apiKey: 'unused-fixture-key' } })
  closeProvider = () => provider.dispose()
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_browser_transport', description: 'Verify that the owned CDP listener received no connection.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute() {
      assert.equal(connections, 0)
      return Promise.resolve('Protected browser listener received zero connections.')
    },
  })))
}
