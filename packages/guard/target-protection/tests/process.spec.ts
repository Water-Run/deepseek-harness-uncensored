/** Real process negative controls and zero native launches for unconstrained executions. @module */
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { brandString } from '@deepseek-ai/dsh-brand'
import TargetProtection from '../src/index.ts'
import TargetSubprocess from '../src/subprocess.ts'
import type { TargetRuleId } from '../src/types.ts'

const contexts: Context[] = [], roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function harness(path = ':memory:') {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-process-')); roots.push(root)
  const ctx = new Context(); contexts.push(ctx)
  const policy = await ctx.plugin(TargetProtection, { path, hostsFile: '' })
  await ctx.plugin(TargetSubprocess)
  const configure = async (mainlandEnabled: boolean, production = false) => {
    const current = await ctx.targetProtection.snapshot()
    await ctx.targetProtection.configure({ mainlandEnabled, rules: [{
      id: brandString<TargetRuleId>(randomUUID()), name: 'exact test host', enabled: true,
      environment: production ? 'production' : 'test', protection: 'audit', kind: 'server', match: 'host', address: '127.0.0.1',
    }] }, current.revision)
  }
  return { ctx, policy, root, configure }
}
function spec(root: string): SubprocessSpawnSpec {
  return { argv: [process.execPath, '-e', 'require("node:fs").writeFileSync("effect.txt", "executed")'], cwd: root,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 1000 }, stderr: { maxBytes: 1000 } }, graceMs: 100 }
}

it('denies shells, indirect scripts and PTY allocation before the local executor is entered', async () => {
  const h = await harness()
  const spawn = vi.spyOn(LocalSubprocessRuntime.prototype, 'spawn')
  const terminal = vi.spyOn(LocalSubprocessRuntime.prototype, 'spawnTerminal')
  for (const [mainland, production] of [[true, false], [false, true]] as const) {
    await h.configure(mainland, production)
    expect(() => h.ctx.subprocess.spawn(spec(h.root))).toThrow(expect.objectContaining({ code: 'TARGET_EXECUTION_UNCONFINED' }))
    await expect(h.ctx.subprocess.spawnTerminal({ argv: [process.execPath], cwd: h.root, rows: 24, cols: 80, terminalType: 'xterm', graceMs: 100 }))
      .rejects.toMatchObject({ code: 'TARGET_EXECUTION_UNCONFINED' })
  }
  expect(spawn).not.toHaveBeenCalled(); expect(terminal).not.toHaveBeenCalled()
  await expect(readFile(join(h.root, 'effect.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('allows the original executor only with no protected targets or owner files', async () => {
  const h = await harness(); await h.configure(false)
  const handle = h.ctx.subprocess.spawn(spec(h.root))
  expect(await handle.done).toMatchObject({ exitCode: 0 })
  expect(await handle.waitForExit()).toBe(true)
  expect(await readFile(join(h.root, 'effect.txt'), 'utf8')).toBe('executed')
  const old = h.ctx.subprocess
  await h.policy.dispose()
  expect(() => old.spawn(spec(h.root))).toThrow()
})

it('a persistent rule file prevents arbitrary code from rewriting its owner settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-owner-')); roots.push(root)
  const h = await harness(join(root, 'rules.sqlite')); await h.configure(false)
  expect(() => h.ctx.subprocess.spawn(spec(h.root))).toThrow(expect.objectContaining({ code: 'TARGET_EXECUTION_UNCONFINED' }))
})

it('terminates an admitted process when the owner activates protection', async () => {
  const h = await harness(); await h.configure(false)
  const handle = h.ctx.subprocess.spawn({ ...spec(h.root),
    argv: [process.execPath, '-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'],
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 1000 } } })
  if (handle.stdout === undefined) throw new Error('Expected the real child stdout pipe')
  await Promise.race([once(handle.stdout, 'data'), handle.done.then(() => { throw new Error('Child exited before readiness') })])
  await h.configure(true)
  await handle.done
  expect(await handle.waitForExit()).toBe(true)
})
