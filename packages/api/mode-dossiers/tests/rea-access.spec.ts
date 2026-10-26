/** Owner-only REA configuration rejects delegated callers before reading host paths or starting a process. @module */
import { Context } from '@deepseek-ai/cordis'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it } from 'vitest'
import { ModeDossiers } from '../src/index.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { /** Delegated integration test caller. */ 'rea-test': { kind: 'rea-test' } }
}

it('allows owner reads and rejects delegated settings and process probes', async () => {
  const ctx = new Context()
  try {
    new ModeDossiers(ctx)
    expect(ctx.modeDossiers.reaSettings()).toBeNull()
    const signal = new AbortController().signal
    const invocation: RemoteInvocation = {
      request: { namespace: 'modeDossiers', method: 'reaSettings', args: {} }, service: 'modeDossiers',
      peer: { id: 'rea-reader' as PeerId, ctx, principal: { kind: 'rea-test' }, interactions: 'none',
        signal, dispose: async () => {} }, signal,
      uplink: async function *<In>(): AsyncIterable<In> {},
    }
    const caller = ctx.extend({ invocation })
    expect(() => caller.modeDossiers.reaSettings()).toThrow('Only the application owner')
    await expect(caller.modeDossiers.probeRea(signal)).rejects.toThrow('Only the application owner')
    await expect(caller.modeDossiers.configureRea({ expectedRevision: 0, options: {
      enabled: false, nodePath: '', cliPath: '', ghidraPath: '', javaHome: '', idaConfig: '', provider: 'auto',
      startupTimeoutMs: 60000, toolTimeoutMs: 180000, catalogPageSize: 20,
    } })).rejects.toThrow('Only the application owner')
  } finally { await ctx.fiber.dispose() }
})
