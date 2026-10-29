/** Real upstream MCP browser checks against private loopback pages and disposable Chromium. */
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import type { Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import BrowserUse from '@deepseek-ai/dsh-browser-use'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Llm from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Agents from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Projections from '@deepseek-ai/dsh-session-projection'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { expect, vi } from 'vitest'
import { promisify } from 'node:util'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { z } from 'zod'
import type { BrowserMcpConfig } from '../src/mcp.ts'

const processRecord = z.object({ pid: z.number().int(), parent: z.number().int(), created: z.string(), name: z.string() })
type ProcessRecord = z.infer<typeof processRecord>
async function processSnapshot(): Promise<ProcessRecord[]> {
  if (process.platform !== 'win32') return []
  const script = '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); @(' +
    'Get-CimInstance Win32_Process | Where-Object {$null -ne $_.CreationDate} | ' +
    'Select-Object @{n="pid";e={$_.ProcessId}},@{n="parent";e={$_.ParentProcessId}},' +
    '@{n="created";e={$_.CreationDate.ToUniversalTime().ToString("o")}},@{n="name";e={$_.Name}}) | ConvertTo-Json -Compress'
  const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: 15000, maxBuffer: 1048576 })
  return z.array(processRecord).parse(JSON.parse(stdout.trim()))
}

/**
 * Select observed native identities and their live descendants without following recycled PIDs.
 * @param processes - One operating-system process snapshot.
 * @param anchors - Identities captured while the SDK roots or their descendants were alive.
 * @returns Matching identities and descendants of those matching live processes.
 */
export function selectProcessRange(processes: readonly ProcessRecord[], anchors: readonly ProcessRecord[]): ProcessRecord[] {
  const owned = new Set(processes.filter(item => anchors.some(anchor => anchor.pid === item.pid
    && anchor.created === item.created && anchor.name === item.name)).map(item => item.pid))
  let size: number
  do {
    size = owned.size
    for (const item of processes) if (owned.has(item.parent)) owned.add(item.pid)
  } while (owned.size !== size)
  return processes.filter(item => owned.has(item.pid))
}

export async function verifyMcpBrowser(
  provider: Pick<Plugin.Object<BrowserMcpConfig>, 'apply'>,
  namespace: string,
  navigate: { name: string; arguments(url: string): Record<string, unknown> },
  mode: 'launch' | 'attach',
): Promise<void> {
  const executable = process.env.DSH_BROWSER_EXECUTABLE!
  const root = await mkdtemp(join(tmpdir(), 'dsh-browser-upstream-'))
  const observed = new Set<string>()
  const server = createServer((request, response) => {
    observed.add(request.url!)
    response.writeHead(200, { 'Content-Type': 'text/html' })
    response.end('<!doctype html><title>DSH browser fixture</title><h1>Browser integration works</h1>')
  })
  const ctx = new Context()
  const nativePids = new Set<number>()
  const nativeRoots: ProcessRecord[] = []
  // oxlint-disable-next-line typescript/unbound-method -- The spy forwards each call with its original transport receiver.
  const start = StdioClientTransport.prototype.start
  const capture = vi.spyOn(StdioClientTransport.prototype, 'start').mockImplementation(async function (this: StdioClientTransport) {
    await start.call(this)
    const pid = this.pid
    if (pid !== null) {
      nativePids.add(pid)
      const root = (await processSnapshot()).find(item => item.pid === pid)
      if (root !== undefined) nativeRoots.push(root)
    }
  })
  let nativeBeforeClose: ProcessRecord[] = []
  let external: ReturnType<typeof spawn> | undefined
  let exited: Promise<unknown> | undefined
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Fixture has no TCP listener')
    const url = `http://127.0.0.1:${address.port}/${namespace}-${mode}`
    let browserConfig: BrowserMcpConfig = { mode: 'launch', headless: true, executablePath: executable }
    if (mode === 'attach') {
      const profile = join(root, 'external-profile')
      external = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
      exited = once(external, 'exit')
      const portFile = join(profile, 'DevToolsActivePort')
      let port: string | undefined
      await vi.waitFor(async () => { port = (await readFile(portFile, 'utf8')).split('\n')[0]; expect(Number(port)).toBeGreaterThan(0) }, { timeout: 20000 })
      browserConfig = { mode: 'attach', endpoint: `http://127.0.0.1:${port}` }
    }
    const modules = new Map<string, unknown>([
      ['browserUse', BrowserUse], ['prompt', SystemPrompt], ['tools', Tools], ['llm', Llm],
      ['sessions', Sessions], ['agents', Agents], ['loop', AgentLoop], ['projections', Projections], ['browser', provider],
      ['fs', LocalFileSystem], ['workingDirectory', WorkingDirectory],
    ])
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, JSON.stringify([...modules.keys()].map(name => ({ id: name, name, config: name === 'loop' ? { agents: [] } : name === 'browser' ? browserConfig : {} }))))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`Unexpected smoke module ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    const owner = await ctx.agents.create({ sessionId: SessionId('browser-upstream'), meta: { cwd: root } })
    await owner.agent.whenIdle()
    await ctx.systemPrompt.assemble({ agent: owner.agent, scope: owner.agent, signal: new AbortController().signal })
    const schemas = ctx.tools.schemas(owner.agent)
    expect(schemas.length).toBeGreaterThan(5)
    expect(schemas.every(tool => tool.name.startsWith(`mcp__${namespace}__`))).toBe(true)
    const result = await ctx.tools.execute({ agent: owner.agent, name: `mcp__${namespace}__${navigate.name}`, arguments: navigate.arguments(url), callId: ToolCallId('navigate'), signal: new AbortController().signal })
    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    expect(observed.has(`/${namespace}-${mode}`)).toBe(true)
    expect(result.content.length).toBeGreaterThan(0)
    nativeBeforeClose = selectProcessRange(await processSnapshot(), nativeRoots)
    if (process.platform === 'win32') {
      expect(nativePids.size).toBeGreaterThan(0)
      expect(nativeRoots.length).toBeGreaterThan(0)
      expect(nativeBeforeClose.length).toBeGreaterThan(0)
      if (mode === 'launch') expect(nativeBeforeClose.some(item => !nativePids.has(item.pid))).toBe(true)
    }
    await owner.dispose()
    expect(ctx.tools.schemas(owner.agent)).toEqual([])
    if (browserConfig.mode === 'attach') {
      expect(external?.exitCode).toBeNull()
      const response = await fetch(`${browserConfig.endpoint}/json/list`)
      const pages = await response.json() as { url: string }[]
      expect(pages.some(page => page.url === url)).toBe(true)
    }
  } finally {
    let after: ProcessRecord[] = []
    try {
      await ctx.fiber.dispose()
      if (process.platform === 'win32') {
        after = selectProcessRange(await processSnapshot(), [...nativeBeforeClose, ...nativeRoots])
        await writeFile(join(root, 'process-exit.json'), JSON.stringify({ roots: nativeRoots, before: nativeBeforeClose, after }))
      }
    } finally {
      capture.mockRestore()
      if (external !== undefined && external.exitCode === null) external.kill('SIGTERM')
      if (exited !== undefined) await exited
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
    expect(after, 'MCP browser process range remains alive after disposal').toEqual([])
    await rm(root, { recursive: true, force: true, ...process.platform === 'win32' ? { maxRetries: 5, retryDelay: 100 } : {} })
  }
}
