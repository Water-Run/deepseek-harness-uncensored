/** Keyless recorded-session fixture for native MCP admission. @module */
import { Context } from '@deepseek-ai/cordis'
import { defineTool, default as ToolRuntime } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import TargetProtection from '../src/index.ts'
import * as ProtectedMcp from '../src/mcp.ts'

/** Cordis fixture name. */
export const name = 'mcp-protection-snapshot'
/** Fixture-owned tool registry. */
export const inject = ['tools']

/** @param ctx - Dedicated recorded-session owner. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'verify_mcp_protection',
    description: 'Verify that target protection refuses an unconfined MCP server before it starts.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      const root = await mkdtemp(join(tmpdir(), 'dshu-mcp-snapshot-'))
      const owner = new Context()
      try {
        exec.signal.throwIfAborted()
        await owner.plugin(SystemPrompt)
        await owner.plugin(ToolRuntime)
        await owner.plugin(TargetProtection, { path: ':memory:', hostsFile: '' })
        await assert.rejects(Promise.resolve(owner.plugin(ProtectedMcp, {
          transport: 'stdio', serverName: 'protected', command: process.execPath, cwd: root,
          args: [fileURLToPath(new URL('./fixtures/mcp.mjs', import.meta.url))],
          failOnStartupError: true,
        })), { code: 'TARGET_EXECUTION_UNCONFINED' })
        assert.deepEqual(await readdir(root), [])
        return 'TARGET_EXECUTION_UNCONFINED: native MCP server was not started.'
      } finally { await owner.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
    },
    presentCall: () => ({ card: 'generic', kind: 'other', title: 'Verify MCP protection' }),
  })))
}
