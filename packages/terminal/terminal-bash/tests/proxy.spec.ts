/** Real Loader, PTY and HTTP proxy composition for security terminal egress. */
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { unsupportedModel, unsupportedInbox, provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import { Session, SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TerminalSessionService, { TerminalSessionId } from '@deepseek-ai/dsh-terminal'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as credentials from '@deepseek-ai/dsh-credentials-local'
import * as securityProxy from '@deepseek-ai/dsh-security-proxy-local'
import * as terminal from '../src/index.ts'
import { startLocalProxy, startLocalTarget, startTcpEcho } from '../../../guard/security-proxy-local/tests/support/local-proxy.ts'

function owner(ctx: Context, id: string, preset: string, cwd: string): Agent {
  const sessionId = SessionId(id)
  return {
    id: sessionId, options: {}, status: 'idle', ctx: ctx.plugin(() => {}).ctx,
    session: Session.create(sessionId, [], {
      version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: 0, isSeeded: false, agentPreset: preset, cwd,
    }),
    model: unsupportedModel(), inbox: unsupportedInbox(),
    send() {}, followup() {}, steer() {}, inject() {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: async () => {},
  }
}

it('routes a security-owned persistent terminal and retains its captured response', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-terminal-proxy-'))
  const ctx = new Context()
  const resources: {
    proxy?: Awaited<ReturnType<typeof startLocalProxy>>
    target?: Awaited<ReturnType<typeof startLocalTarget>>
    echo?: Awaited<ReturnType<typeof startTcpEcho>>
  } = {}
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally {
      await Promise.all([resources.proxy?.close(), resources.target?.close(), resources.echo?.close()])
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
  const proxy = resources.proxy = await startLocalProxy()
  const target = resources.target = await startLocalTarget()
  const echo = resources.echo = await startTcpEcho()
  provideWorkingDirectoryFixture(ctx)
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, {
    include: Include, agents: AgentRegistry, projections: SessionProjectionRegistry, terminals: TerminalSessionService,
    subprocess: LocalSubprocessRuntime, policy: SandboxPolicyService, credentials, proxy: securityProxy, terminal,
  })
  const config = join(root, 'cordis.yml')
  await writeFile(config, [
    '- name: cordis:projections', '- name: cordis:agents', '- name: cordis:terminals', '- name: cordis:subprocess',
    '- name: cordis:policy', '  config:', '    mode: danger-full-access', `    workspaceRoot: ${JSON.stringify(root)}`,
    '- name: cordis:credentials', '  config:', `    path: ${JSON.stringify(join(root, 'credentials.yaml'))}`, '    watch: false',
    '- name: cordis:proxy', '  config:', `    path: ${JSON.stringify(join(root, 'proxy.json'))}`,
    '    testHost: 127.0.0.1', `    testPort: ${echo.port}`, '    requestTimeoutMs: 5000',
    '- name: cordis:terminal', '  config:', `    shellDialect: ${process.platform === 'win32' ? 'pwsh' : 'bash'}`,
    '    timeoutMs: 10000', '    idleSilenceMs: 250', '    handoffGraceMs: 250', '    disposeGraceMs: 500', '',
  ].join('\n'))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  expect((await ctx.securityProxy.configure({ enabled: true, host: '127.0.0.1', port: proxy.port })).status).toBe('ready')
  const security = owner(ctx, 'security-terminal', 'security', root)
  await ctx.agents.register(security)
  const opened = await ctx.terminals.spawn(security, { type: 'shell', cwd: root })
  const script = join(root, 'request.mjs')
  await writeFile(script, `import http from 'node:http';
const upstream=new URL(process.env.HTTP_PROXY);
const target=process.argv[2];
http.get({hostname:upstream.hostname,port:upstream.port,path:target,headers:{host:new URL(target).host}},res=>{
let text='';res.on('data',part=>text+=part);res.on('end',()=>console.log('TERMINAL_PROXY_COMPLETE '+res.statusCode+' '+text));
}).on('error',error=>{console.error(error);process.exitCode=1});\n`)
  const quote = (value: string): string => process.platform === 'win32'
    ? `'${value.replaceAll("'", "''")}'` : `'${value.replaceAll("'", "'\\''")}'`
  const command = `${process.platform === 'win32' ? '& ' : ''}${quote(process.execPath)} ${quote(script)} ${quote(target.url)}`
  const operation = ctx.terminals.startSend(security, TerminalSessionId(opened.sessionId), { text: command, submit: true })
  await vi.waitFor(() => {
    expect(ctx.terminals.read(security, TerminalSessionId(opened.sessionId), {}).text).toContain('TERMINAL_PROXY_COMPLETE 200 target body')
  }, { timeout: 15000, interval: 25 })
  await operation.done
  const flows = await ctx.securityProxy.list({})
  expect(proxy.requests.map(request => request.url)).toContain(target.url)
  expect(flows.flows).toContainEqual(expect.objectContaining({ sessionId: security.session.id, tool: 'terminal_open', status: 200 }))
  const normal = owner(ctx, 'normal-terminal', 'standard', root)
  await ctx.agents.register(normal)
  expect(await ctx.securityProxy.environment(normal, 'terminal_open')).toBeUndefined()
  expect(await ctx.securityProxy.environment(owner(ctx, 'reverse-terminal', 'reverse', root), 'terminal_open')).toBeUndefined()
  await ctx.terminals.kill(security, TerminalSessionId(opened.sessionId))
  const entered = Promise.withResolvers<undefined>()
  const released = Promise.withResolvers<Readonly<Record<string, string>> | undefined>()
  const environment = vi.spyOn(ctx.securityProxy, 'environment').mockImplementationOnce(async () => {
    entered.resolve(undefined)
    return released.promise
  })
  const spawn = vi.spyOn(ctx.subprocess, 'spawnTerminal')
  try {
    const controller = new AbortController()
    const reason = new Error('cancel terminal proxy preparation')
    const opening = ctx.terminals.spawn(security, { type: 'shell', cwd: root }, controller.signal)
    const rejected = expect(opening).rejects.toBe(reason)
    await entered.promise
    controller.abort(reason)
    released.resolve(undefined)
    await rejected
    expect(spawn).not.toHaveBeenCalled()
  } finally { released.resolve(undefined); environment.mockRestore(); spawn.mockRestore() }
})
