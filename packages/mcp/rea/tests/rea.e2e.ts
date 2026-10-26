/** Real optional REA/Ghidra acceptance through the shipped consumer; owns only temporary samples. @module */
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import ReaService from '../src/index.ts'
import * as ReaAgent from '../src/agent.ts'

const nodePath = process.env['DSH_REA_TEST_NODE']
const cliPath = process.env['DSH_REA_TEST_CLI']
const ghidraPath = process.env['DSH_REA_TEST_GHIDRA']
const javaHome = process.env['DSH_REA_TEST_JAVA_HOME']
const binary = process.env['DSH_REA_TEST_BINARY']

it.skipIf(nodePath === undefined || cliPath === undefined)('discovers real REA, analyzes JavaScript and optionally an owned native sample', async () => {
  if (nodePath === undefined || cliPath === undefined) throw new Error('Explicit installed REA paths required')
  const cwd = await mkdtemp(join(tmpdir(), 'dshu-rea-product-'))
  const ctx = new Context()
  try {
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'rea-product-fixture', version: '1.0.0', type: 'module' }))
    await writeFile(join(cwd, 'index.js'), 'export function addValues(left, right) { return left + right }\n')
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
    await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: cwd })
    await ctx.plugin(ReaService, { enabled: true, nodePath, cliPath,
      ...ghidraPath === undefined ? {} : { ghidraPath, provider: 'ghidra' },
      ...javaHome === undefined ? {} : { javaHome } })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(ReaAgent)
    const agent = await ctx.agentLoop.create(SessionId('rea-real'), {}, { cwd })
    let callNumber = 0
    const call = async (name: string, arguments_: unknown) => {
      const result = await ctx.tools.execute({ name, arguments: arguments_, agent,
        signal: AbortSignal.timeout(240000), callId: ToolCallId(`rea-${String(++callNumber)}`) })
      expect(result.isError, JSON.stringify(result)).toBe(false)
      return JSON.stringify(result)
    }
    const discovery = await call('rea_tools', { names: ['analyze_javascript_application'] })
    expect(discovery).toContain('229')
    expect(ctx.tools.schemas(agent).filter(tool => tool.name.startsWith('mcp__rea__'))).toHaveLength(1)
    expect(await call('mcp__rea__analyze_javascript_application', { input_path: cwd })).toContain('addValues')
    if (binary !== undefined && ghidraPath !== undefined && javaHome !== undefined) {
      const target = join(cwd, 'sample.exe')
      await copyFile(binary, target)
      await call('rea_tools', { names: ['open_binary', 'binary_overview', 'analyze_function'] })
      await call('mcp__rea__open_binary', { path: target })
      expect(await call('mcp__rea__binary_overview', {})).toContain('sample.exe')
      expect(await call('mcp__rea__analyze_function', { procedure: 'add_values', detail: 'summary' })).toContain('add_values')
    }
  } finally {
    await ctx.fiber.dispose()
    await rm(cwd, { recursive: true, force: true })
  }
}, 300000)
