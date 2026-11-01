/** Real PTC sub-dispatch with independent protected/test file verification. @module */
import { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TargetRuleId } from '../src/types.ts'
import type {} from '../src/index.ts'

/** Cordis fixture name. */
export const name = 'ptc-target-protection-snapshot'
/** Execution uses the real PTC consumer, runtime and guarded filesystem. */
export const inject = ['tools', 'fs', 'targetProtection', 'ptcRuntime']

/** @param ctx - Owner of the temporary profile and workspace. */
export async function apply(ctx: Context): Promise<void> {
  const production = join(process.cwd(), 'production.txt'), test = join(process.cwd(), 'test.txt')
  await writeFile(production, 'preserve')
  await writeFile(test, 'before')
  const before = await ctx.targetProtection.snapshot()
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id: brandString<TargetRuleId>('5a903f85-5cbb-4030-a31f-32ad25857dd0'), name: 'owned production fixture', enabled: true,
      kind: 'database', environment: 'production', protection: 'full', match: 'path', address: production },
    { id: brandString<TargetRuleId>('8ca63cc9-929d-49db-a53e-1ca3432e27f4'), name: 'owned test fixture', enabled: true,
      kind: 'database', environment: 'test', protection: 'full', match: 'path', address: test },
  ] }, before.revision)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'protected_write', description: 'Write one named workspace fixture through actual file protection.',
    parameters: { path: { type: 'string', required: true }, text: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      assert.ok(args.path === 'production.txt' || args.path === 'test.txt')
      await ctx.fs.writeText(await ctx.fs.resolve(args.path), args.text)
      return 'written'
    },
  })))
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_protected_files', description: 'Independently read the owned production and test files.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() {
      assert.equal(await readFile(production, 'utf8'), 'preserve')
      assert.equal(await readFile(test, 'utf8'), 'changed')
      return 'Production preserved; test changed.'
    },
  })))
}
