/** Loader activation and withdrawal with an actual SSH protocol peer. @module */
import type { Config } from '../../src/direct.ts'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import TargetProtection, { TargetStore, type TargetRuleId } from '@deepseek-ai/dsh-target-protection'
import ProtectedSsh from '@deepseek-ai/dsh-target-protection/ssh'
import { brandString } from '@deepseek-ai/dsh-brand'
import { targetSchema } from '../../src/schemas.ts'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { harness } from './fixture.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { sshFixture: { registry: string; configuration: Config } }
}

it.each(['full', 'audit'] as const)('loads the %s policy from YAML and preserves the mandatory rule dependency', async (protection) => {
  const h = await harness({ handle: async (method, params) => {
    if (method !== 'fs.resolve') throw new Error('Unexpected fixture call')
    const { path } = z.object({ path: z.string() }).parse(params)
    return { displayPath: path, targetKey: path }
  } })
  const registry = join(h.root, 'targets.sqlite'), store = await TargetStore.open(registry, 1000)
  try {
    store.configure({ mainlandEnabled: false, rules: [{ id: brandString<TargetRuleId>(randomUUID()),
      name: 'owned fixture', kind: 'server', enabled: true, environment: 'production', protection,
      match: 'host', address: '127.0.0.1',
    }] }, store.snapshot().revision)
  } finally { store.close() }
  h.ctx.provide('sshFixture', { registry, configuration: h.config })
  h.ctx.baseUrl = pathToFileURL(h.root).href + '/'
  await h.ctx.plugin(Loader)
  Object.assign(h.ctx.loader.builtins, { include: Include, target: TargetProtection, 'protected-ssh': ProtectedSsh })
  const configPath = join(h.root, 'cordis.yml')
  await copyFile(fileURLToPath(new URL('./fixtures/protected.yml', import.meta.url)), configPath)
  await h.ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await h.ctx.loader.await()
  const entry = [...h.ctx.loader.entries()].find(entry => entry.options.id === 'protected-ssh')
  if (entry?.fiber === undefined) throw new Error('Fixture SSH entry is missing')
  if (protection === 'full') {
    await expect(entry.fiber.await()).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
    expect(h.connected()).toBe(0)
    expect(h.ctx.get('ssh')).toBeUndefined()
    return
  }
  await entry.fiber.await()
  expect(await h.ctx.ssh.request('fs.resolve', { path: '/fixture/workspace/readme' }, targetSchema)).toMatchInlineSnapshot(`
    {
      "displayPath": "/fixture/workspace/readme",
      "targetKey": "/fixture/workspace/readme",
    }
  `)
  const target = [...h.ctx.loader.entries()].find(entry => entry.options.id === 'target')
  if (target?.fiber === undefined) throw new Error('Fixture rule entry is missing')
  const stale = h.ctx.ssh
  await target.fiber.dispose(); await h.ctx.loader.await()
  expect(h.ctx.get('ssh')).toBeUndefined()
  await expect(stale.request('fs.resolve', { path: '/fixture/workspace/readme' }, targetSchema)).rejects.toBeDefined()
})
