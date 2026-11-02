/** A real Loader-owned native subprocess service runs commands without ordinary-process fallback. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as Credentials from '@deepseek-ai/dsh-credentials-local'
import { PwshLocalExecutor, resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'
import { probe } from '@microsoft/mxc-sdk/v1'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extendWin32ProcessBindings, isNullPtr, type CurrentTokenProcessBindings, type NativePtr } from '@deepseek-ai/dsh-win32-process'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import TargetProtection from '../src/index.ts'
import type { TargetRuleId } from '../src/types.ts'
import NativeSubprocess from '../src/subprocess-native.ts'

const supported = process.platform === 'win32' && probe().tier === 'base-container'

async function fixture(network: 'disabled' | 'gateway' = 'disabled') {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-provider-')), ctx = new Context()
  const work = join(root, 'work'), temporary = join(root, 'private'), production = join(work, 'production.txt')
  const listeners = process.listenerCount('exit')
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    expect(process.listenerCount('exit')).toBe(listeners)
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  await mkdir(work); await writeFile(production, 'production unchanged')
  const repository = fileURLToPath(new URL('../../../..', import.meta.url))
  const pwsh = resolvePwshPath()
  const replacements = { __CREDENTIALS__: join(root, 'credentials.yml'), __HOME__: root, __RULES__: join(root, 'rules.sqlite'),
    __READ__: [repository, dirname(process.execPath), dirname(pwsh)], __WRITE__: [work], __TEMP__: temporary,
    __NETWORK__: network, __WORK__: work, __PWSH__: pwsh }
  let config = await readFile(new URL('./fixtures/native.cordis.yml', import.meta.url), 'utf8')
  for (const [key, value] of Object.entries(replacements)) config = config.replace(key, JSON.stringify(value))
  const path = join(root, 'cordis.yml')
  await writeFile(path, config)
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.credentials = Credentials
  ctx.loader.builtins.protection = TargetProtection
  ctx.loader.builtins.native = NativeSubprocess
  ctx.loader.builtins.shell = PwshLocalExecutor
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  const entry = [...ctx.loader.entries()].find(entry => entry.options.id === 'native')
  if (entry?.fiber === undefined) throw new Error('Native provider was not loaded')
  await entry.fiber.await()
  await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{
    id: '4df071d9-85dd-40a2-adc0-016e30534528' as TargetRuleId, name: 'production file', enabled: true,
    kind: 'server', environment: 'production', protection: 'full', match: 'path', address: production,
  }] }, 1)
  const spec = (program: string): SubprocessSpawnSpec => ({ argv: [process.execPath, '-e', program], cwd: work,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 8192 }, stderr: { maxBytes: 8192 } }, graceMs: 1000 })
  return { root, work, temporary, production, ctx, fiber: entry.fiber, spec }
}

describe.skipIf(!supported)('native subprocess through the Loader', () => {
  it('runs a real command, keeps production unchanged and removes its private directory', async () => {
    const h = await fixture()
    expect(await h.ctx.subprocess.resolveExecutable(process.execPath)).toBe(process.execPath)
    const program = `const fs=require('node:fs');let blocked=false;
try{fs.writeFileSync(${JSON.stringify(h.production)},'wrong')}catch(e){blocked=e.code==='EPERM'}
fs.writeFileSync('test-output.txt','allowed');process.stdout.write(JSON.stringify({blocked,privateHome:process.env.HOME===process.env.TEMP}));`
    const handle = h.ctx.subprocess.spawn(h.spec(program))
    expect(await handle.done).toEqual({ exitCode: 0, signal: null })
    expect(await handle.waitForExit()).toBe(true)
    expect(handle.collected.stdout?.readFrom(0).text).toMatchInlineSnapshot('"{\"blocked\":true,\"privateHome\":true}"')
    expect(await readFile(h.production, 'utf8')).toBe('production unchanged')
    expect(await readFile(join(h.work, 'test-output.txt'), 'utf8')).toBe('allowed')
    expect(await readdir(h.temporary)).toEqual([])
    await h.fiber.dispose(); await h.ctx.loader.await()
    expect(h.ctx.get('subprocess')).toBeUndefined()
  })

  it('runs the existing PowerShell executor through native file enforcement', async () => {
    const h = await fixture()
    const command = `$ErrorActionPreference='Stop'; $blocked=$false; try { Set-Content -LiteralPath '${h.production}' -Value 'wrong' }
catch { $blocked=$true }; Set-Content -LiteralPath 'shell-test.txt' -Value 'allowed'; Write-Output ('PROTECTED=' + $blocked)`
    const result = await (await h.ctx.shell.execute(h.ctx.shell.resolve({ command }))).result()
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text.trim()).toMatchInlineSnapshot('"PROTECTED=True"')
    expect(await readFile(h.production, 'utf8')).toBe('production unchanged')
    expect((await readFile(join(h.work, 'shell-test.txt'), 'utf8')).trim()).toBe('allowed')
  })

  it.each(['command', 'terminal'] as const)('routes %s HTTP through the gateway and rejects direct egress', async (kind) => {
    const h = await fixture('gateway'), connections = [0, 0]
    const servers = [0, 1].map((index) => {
      const server = createServer((_request, response) => { response.end('owned response') })
      server.on('connection', () => { connections[index]!++ })
      onTestFinished(async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
      })
      return server
    })
    await Promise.all(servers.map(server => new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })))
    const ports = servers.map(server => (server.address() as AddressInfo).port)
    const previous = await h.ctx.targetProtection.snapshot()
    await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [...previous.preferences.rules,
      ...ports.map((port, index) => ({ id: (index === 0 ? '2e3a017d-ef02-427f-9c7f-860bed4d8148'
        : 'a3703083-4ea4-4eec-8c60-d56f08895843') as TargetRuleId, name: index === 0 ? 'test' : 'production', enabled: true,
      kind: 'server' as const, environment: index === 0 ? 'test' as const : 'production' as const,
      protection: 'full' as const, match: 'host' as const, address: '127.0.0.1', port })),
    ] }, previous.revision)
    const program = `const http=require('node:http'),net=require('node:net'),ports=${JSON.stringify(ports)};
async function get(port){return new Promise((resolve,reject)=>{http.get('http://127.0.0.1:'+port+'/',res=>{
res.resume();res.on('end',()=>resolve(res.statusCode));res.on('error',reject)}).on('error',reject)})}
async function direct(){return new Promise(resolve=>{const socket=net.connect(ports[0],'127.0.0.1');socket.on('connect',()=>{socket.destroy();resolve('CONNECTED')});socket.on('error',error=>{socket.destroy();resolve(error.code)})})}
(async()=>process.stdout.write(JSON.stringify([await get(ports[0]),await get(ports[1]),await direct()])))()
.catch(error=>{process.stderr.write(String(error));process.exitCode=1});`
    if (kind === 'command') {
      const handle = h.ctx.subprocess.spawn(h.spec(program))
      expect(await handle.done).toEqual({ exitCode: 0, signal: null })
      expect(await handle.waitForExit()).toBe(true)
      expect(handle.collected.stdout?.readFrom(0).text).toBe('[200,403,"EACCES"]')
    } else {
      const terminal = await h.ctx.subprocess.spawnTerminal({ argv: [process.execPath, '-e', program], cwd: h.work,
        cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000 })
      let output = ''
      terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
      try {
        expect(await terminal.done).toEqual({ exitCode: 0, signal: null })
        expect(output).toContain('[200,403,"EACCES"]')
      } finally { await terminal.terminate() }
    }
    expect(connections).toEqual([1, 0])
  })

  it('cancels a running native command and waits for its entire managed range', async () => {
    const h = await fixture(), cancellation = new AbortController()
    const handle = h.ctx.subprocess.spawn({ ...h.spec('process.stdout.write("ready");setInterval(()=>{},1000)'), signal: cancellation.signal,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 8192 } } })
    if (handle.stdout === undefined) throw new Error('Expected raw output')
    await Promise.race([once(handle.stdout, 'data'), handle.done.then(() => { throw new Error('Native command exited before readiness') })])
    cancellation.abort(new Error('owner cancelled'))
    await handle.done.catch(() => undefined)
    expect(await handle.waitForExit()).toBe(true)
    expect(await readdir(h.temporary)).toEqual([])
  })

  it('stops active execution before committing changed target rules', async () => {
    const h = await fixture(), provider = h.ctx.subprocess
    const handle = provider.spawn({ ...h.spec('process.stdout.write("ready");setInterval(()=>{},1000)'),
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 8192 } } })
    if (handle.stdout === undefined) throw new Error('Expected raw output')
    await Promise.race([once(handle.stdout, 'data'), handle.done.then(() => { throw new Error('Native command exited before readiness') })])
    const snapshot = await h.ctx.targetProtection.snapshot()
    const changed = await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, snapshot.revision)
    expect(changed.revision).toBe(snapshot.revision + 1)
    expect(await handle.waitForExit()).toBe(true)
    await handle.done.catch(() => undefined)
    await h.fiber.dispose()
    expect(() => provider.spawn(h.spec(''))).toThrow()
  })

  it('runs a real protected ConPTY and joins its native range on close', async () => {
    const h = await fixture()
    const program = `const fs=require('node:fs');let denied=false;try{fs.writeFileSync(${JSON.stringify(h.production)},'wrong')}catch(e){denied=e.code==='EPERM'}
process.stdin.setRawMode(true);process.stdout.on('resize',()=>process.stdout.write('SIZE_'+JSON.stringify(process.stdout.getWindowSize())+String.fromCharCode(10)));
process.stdout.write('READY_'+JSON.stringify({tty:process.stdin.isTTY&&process.stdout.isTTY,denied})+String.fromCharCode(10));
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{input+=data;if(input.includes('inspect')){process.stdout.write('INPUT_ACCEPTED'+String.fromCharCode(10));input=''}});`
    const terminal = await h.ctx.subprocess.spawnTerminal({ argv: [process.execPath, '-e', program], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm-256color', graceMs: 1000 })
    let output = ''
    terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
    try {
      await vi.waitFor(() => { expect(output).toContain('"tty":true,"denied":true') }, { timeout: 10000 })
      await terminal.resize(100, 30)
      await vi.waitFor(() => { expect(output).toContain('SIZE_[100,30]') }, { timeout: 10000 })
      await terminal.write('inspect\r')
      await vi.waitFor(() => { expect(output).toContain('INPUT_ACCEPTED') }, { timeout: 10000 })
      expect(await terminal.inspectForeground()).toMatchObject({ processGroupId: terminal.pid, inputWaiting: false })
      expect(['busy', 'unknown']).toContain((await terminal.inspectActivity()).state)
    } finally { await terminal.terminate() }
    await terminal.done.catch(() => undefined)
    expect((await terminal.inspectActivity()).state).toBe('idle')
    expect(await readFile(h.production, 'utf8')).toBe('production unchanged')
    expect(await readdir(h.temporary)).toEqual([])
  })

  it('delivers Ctrl-C to the owned console without terminating the terminal helper', async () => {
    const h = await fixture()
    const program = `process.on('SIGINT',()=>process.stdout.write('INTERRUPTED'+String.fromCharCode(10)));
process.stdin.resume();process.stdout.write('READY_FOR_SIGNAL'+String.fromCharCode(10));setInterval(()=>{},1000);`
    const terminal = await h.ctx.subprocess.spawnTerminal({ argv: [process.execPath, '-e', program], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000 })
    let output = ''
    terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
    try {
      await vi.waitFor(() => { expect(output).toContain('READY_FOR_SIGNAL') }, { timeout: 10000 })
      expect(await terminal.signalForeground('SIGINT')).toBe(terminal.pid)
      await vi.waitFor(() => { expect(output).toContain('INTERRUPTED') }, { timeout: 10000 })
    } finally { await terminal.terminate() }
    expect(await readdir(h.temporary)).toEqual([])
  })

  it('retains terminal tail output through natural shell exit', async () => {
    const h = await fixture()
    const program = "process.stdout.write('x'.repeat(65536));process.stdout.write('END_中文🙂'+String.fromCharCode(10));process.exitCode=23;"
    const terminal = await h.ctx.subprocess.spawnTerminal({ argv: [process.execPath, '-e', program], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000 })
    let output = ''
    terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
    try {
      expect(await terminal.done).toEqual({ exitCode: 23, signal: null })
      expect(output).toContain('END_中文🙂')
    } finally { await terminal.terminate() }
    expect(await readdir(h.temporary)).toEqual([])
  })

  it('closes the native range even when the terminal output consumer is paused', async () => {
    const h = await fixture()
    const terminal = await h.ctx.subprocess.spawnTerminal({
      argv: [process.execPath, '-e', "process.stdout.write('x'.repeat(1024*1024));setInterval(()=>{},1000)"], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000,
    })
    try {
      await vi.waitFor(() => { expect(terminal.output.readableLength).toBeGreaterThan(0) }, { timeout: 10000 })
    } finally { await terminal.terminate() }
    expect(terminal.output.destroyed).toBe(true)
    expect(await readdir(h.temporary)).toEqual([])
  })

  it('reaps detached terminal descendants before releasing the protected range', async () => {
    const h = await fixture(), marker = join(h.work, 'descendant.pid')
    const program = `const {spawn}=require('node:child_process'),fs=require('node:fs');
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,windowsHide:true,stdio:'ignore'});child.unref();
fs.writeFileSync(${JSON.stringify(marker)},String(child.pid));process.stdout.write('DESCENDANT_READY'+String.fromCharCode(10));
process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(data.includes('exit'))process.exit(0)});`
    const terminal = await h.ctx.subprocess.spawnTerminal({ argv: [process.execPath, '-e', program], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000 })
    let output = ''
    terminal.output.on('data', (bytes: Buffer) => { output += bytes.toString() })
    const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({
      openProcess: bind(kernel32, 'OpenProcess', 'void *', ['uint32', 'int', 'uint32']),
    })) as CurrentTokenProcessBindings & { openProcess(access: number, inherit: number, pid: number): NativePtr | null }
    let child: NativePtr | null = null
    try {
      await vi.waitFor(() => { expect(output).toContain('DESCENDANT_READY') }, { timeout: 10000 })
      child = api.openProcess(0x00100000, 0, Number(await readFile(marker, 'utf8')))
      if (isNullPtr(child)) throw new Error('Owned detached descendant was not observable')
      expect(api.waitForSingleObject(child, 0)).not.toBe(0)
      await terminal.write('exit\r')
      expect(await terminal.done).toEqual({ exitCode: 0, signal: null })
      await terminal.terminate()
      expect(api.waitForSingleObject(child, 0)).toBe(0)
      expect(await readdir(h.temporary)).toEqual([])
    } finally {
      await terminal.terminate()
      if (!isNullPtr(child)) expect(api.closeHandle(child)).toBe(1)
    }
  })

  it('cleans a failed native terminal allocation before admitting another terminal', async () => {
    const h = await fixture()
    await expect(h.ctx.subprocess.spawnTerminal({ argv: [join(h.work, 'missing-program.exe')], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000 })).rejects.toBeDefined()
    expect(await readdir(h.temporary)).toEqual([])
    const terminal = await h.ctx.subprocess.spawnTerminal({ argv: [process.execPath, '-e', 'process.exit(0)'], cwd: h.work,
      cols: 80, rows: 24, terminalType: 'xterm', graceMs: 1000 })
    terminal.output.resume()
    try { expect(await terminal.done).toEqual({ exitCode: 0, signal: null }) }
    finally { await terminal.terminate() }
  })
})
