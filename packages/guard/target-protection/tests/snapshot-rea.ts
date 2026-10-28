/** Dedicated keyless Session fixture for execution-layer REA refusal. @module */
import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import TargetProtection from '../src/index.ts'
import TargetRea from '../src/rea.ts'

/** Cordis fixture name. */
export const name = 'rea-protection-snapshot'
/** Fixture-owned tool registry. */
export const inject = ['tools']

/** @param ctx - Dedicated snapshot owner. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_rea_protection',
    description: 'Verify that target protection refuses an unconfined REA process before it starts.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      const root = await mkdtemp(join(tmpdir(), 'dshu-rea-snapshot-'))
      const owner = new Context()
      try {
        exec.signal.throwIfAborted()
        await owner.plugin(TargetProtection, { path: ':memory:', hostsFile: '' })
        await owner.plugin(TargetRea, { enabled: true, nodePath: process.execPath,
          cliPath: fileURLToPath(new URL('./fixtures/rea.mjs', import.meta.url)) })
        await assert.rejects(owner.rea.connect(root, exec.signal), { code: 'TARGET_EXECUTION_UNCONFINED' })
        assert.deepEqual(await readdir(root), [])
        return 'TARGET_EXECUTION_UNCONFINED: native REA process was not started.'
      } finally { await owner.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
    },
    presentCall: () => ({ card: 'generic', kind: 'other', title: 'Verify REA protection' }),
  })))
}
