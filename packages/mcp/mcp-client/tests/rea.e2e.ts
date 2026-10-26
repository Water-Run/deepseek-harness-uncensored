/**
 * Real REA compatibility with a caller-installed runtime: DSH_REA_TEST_NODE and DSH_REA_TEST_CLI.
 * Native analysis also requires DSH_REA_TEST_GHIDRA, DSH_REA_TEST_JAVA_HOME and DSH_REA_TEST_BINARY (an owned sample).
 * Each test owns its server process, temporary home and analysis artifacts; it never runs REA setup.
 */
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import * as McpClient from '../src/index.ts'

const executable = process.env['DSH_REA_TEST_NODE']
const cli = process.env['DSH_REA_TEST_CLI']

it.skipIf(executable === undefined || cli === undefined)('discovers REA and analyzes an owned JavaScript fixture through DSH', async () => {
  if (executable === undefined || cli === undefined) throw new Error('Explicit REA runtime paths required')
  const directory = await mkdtemp(join(tmpdir(), 'dshu-rea-'))
  const ctx = new Context()
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'dshu-rea-fixture', version: '1.0.0', type: 'module' }))
    await writeFile(join(directory, 'index.js'), 'export function addValues(left, right) { return left + right }\n')
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(McpClient, McpClient.Config({
      transport: 'stdio', serverName: 'rea', command: executable, args: [cli, 'mcp'], cwd: directory,
      env: { HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: directory, REA_MCP_INPUT_SCHEMA_PROFILE: 'compact' },
      toolCallTimeoutMs: 120_000, failOnStartupError: true, reconnect: { enabled: false },
    }))
    const tools = ctx.tools.schemas()
    expect(tools.some(tool => tool.name === 'mcp__rea__open_binary')).toBe(true)
    expect(tools.some(tool => tool.name === 'mcp__rea__analyze_function')).toBe(true)
    const result = await ctx.tools.execute({
      name: 'mcp__rea__analyze_javascript_application', callId: ToolCallId('rea-static-fixture'),
      arguments: { input_path: directory }, signal: AbortSignal.timeout(120_000),
    })
    expect(result.isError).toBeFalsy()
    expect(JSON.stringify(result)).toContain('addValues')
  } finally {
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 180_000)

const nativeSample = process.env['DSH_REA_TEST_BINARY']
const ghidra = process.env['DSH_REA_TEST_GHIDRA']
const javaHome = process.env['DSH_REA_TEST_JAVA_HOME']

it.skipIf(executable === undefined || cli === undefined || nativeSample === undefined || ghidra === undefined || javaHome === undefined)(
  'opens an owned native fixture with Ghidra through DSH and retrieves its analysis', async () => {
    if (executable === undefined || cli === undefined || nativeSample === undefined || ghidra === undefined || javaHome === undefined) {
      throw new Error('Explicit REA, Ghidra, Java and fixture paths required')
    }
    const directory = await mkdtemp(join(tmpdir(), 'dshu-rea-native-'))
    const ctx = new Context()
    try {
      const target = join(directory, 'sample.exe')
      await copyFile(nativeSample, target)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)
      await ctx.plugin(McpClient, McpClient.Config({
        transport: 'stdio', serverName: 'rea', command: executable, args: [cli, 'mcp'], cwd: directory,
        env: { HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: directory, REA_MCP_INPUT_SCHEMA_PROFILE: 'compact',
          GHIDRA_INSTALL_DIR: ghidra, JAVA_HOME: javaHome, REA_ANALYSIS_PROVIDER: 'ghidra' },
        toolCallTimeoutMs: 180_000, failOnStartupError: true, reconnect: { enabled: false },
      }))
      const opened = await ctx.tools.execute({
        name: 'mcp__rea__open_binary', callId: ToolCallId('rea-open-fixture'),
        arguments: { path: target }, signal: AbortSignal.timeout(180_000),
      })
      expect(opened.isError, JSON.stringify(opened)).toBeFalsy()
      const overview = await ctx.tools.execute({
        name: 'mcp__rea__binary_overview', callId: ToolCallId('rea-overview-fixture'),
        arguments: {}, signal: AbortSignal.timeout(60_000),
      })
      expect(overview.isError, JSON.stringify(overview)).toBeFalsy()
      expect(JSON.stringify(overview)).toContain('sample.exe')
      const analysis = await ctx.tools.execute({
        name: 'mcp__rea__analyze_function', callId: ToolCallId('rea-analyze-fixture'),
        arguments: { procedure: 'add_values', detail: 'summary' }, signal: AbortSignal.timeout(60_000),
      })
      expect(analysis.isError, JSON.stringify(analysis)).toBeFalsy()
      expect(JSON.stringify(analysis)).toContain('add_values')
    } finally {
      await ctx.fiber.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  }, 240_000,
)
