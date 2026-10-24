import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { apply as gateway, inject as gatewayInject } from '@deepseek-ai/dsh-api-gateway/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { apply, inject } from '../src/client/index.ts'

it('mounts the application Remote namespaces together and retracts them on disposal', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', {
      interactions: 'none', isLoopback: true,
      generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
      state: { getSnapshot: () => undefined, subscribe: () => () => {} },
      reconnect: () => {}, registerGenerationSource: () => () => {}, start: () => ({ stop: () => {} }),
      openWebSocket: () => { throw new Error('namespace assembly must not open a socket') },
      rpc: {
        call: async () => { throw new Error('namespace assembly must not call the Host') },
        open: async function *() { throw new Error('namespace assembly must not open a stream') },
      },
    } satisfies ConnectionHandle)
    await ctx.plugin({ inject: gatewayInject, apply: gateway })
    const mounted = ctx.plugin({ inject, apply })
    await mounted
    expect(typeof ctx.remote.dynamicCordisRunner.syncInspectManifest).toBe('function')
    expect(typeof ctx.remote.memory.describe).toBe('function')
    expect(typeof ctx.remote.memory.deleteRecord).toBe('function')
    expect(typeof ctx.remote.modeDossiers.inventory).toBe('function')
    expect(typeof ctx.remote.securityProxy.get).toBe('function')
    await mounted.dispose()
    expect(ctx.get('remote.memory')).toBeUndefined()
  } finally { await ctx.fiber.dispose() }
})
