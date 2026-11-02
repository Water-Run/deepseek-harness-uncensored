/** Real MXC egress can reach only the execution-owned gateway, never the target directly. @module */
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { bindManagedProcess } from '@deepseek-ai/dsh-subprocess-local/managed'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { probe } from '@microsoft/mxc-sdk/v1'
import { createServer, type Server } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { expect, it, onTestFinished } from 'vitest'
import TargetProtection from '../src/index.ts'
import type { TargetRuleId } from '../src/types.ts'
import { compileNativeFilePolicy } from '../src/native-file-policy.ts'
import { createNativeHostExecution, type NativeHostExecution } from '../src/native-host.ts'
import { launchNativeBroker } from '../src/native-launch.ts'
import { startNativeGateway } from '../src/native-gateway.ts'

const supported = process.platform === 'win32' && probe().tier === 'base-container'

it.skipIf(!supported)('enforces proxy-only native egress while preserving test access and production refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshu-native-egress-')), ctx = new Context()
  const sockets = new Set<Socket>(), servers: Server[] = []
  let host: NativeHostExecution | undefined = undefined
  onTestFinished(async () => {
    try { await host?.dispose(); await ctx.fiber.dispose() }
    finally {
      await Promise.all([...sockets].map(socket => new Promise<void>((resolve) => {
        if (socket.closed) resolve()
        else { socket.once('close', () => { resolve() }); socket.destroy() }
      })))
      await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
        server.closeAllConnections(); server.close((error) => { if (error) reject(error); else resolve() })
      })))
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  })
  const connections = [0, 0]
  for (let index = 0; index < 2; index++) {
    const server = createServer((_request, response) => { response.end('allowed test response') })
    server.on('connection', (socket) => {
      connections[index]!++; sockets.add(socket)
      socket.once('close', () => { sockets.delete(socket) }); socket.on('error', () => { socket.destroy() })
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    servers.push(server)
  }
  const ports = servers.map(server => (server.address() as AddressInfo).port)
  const work = join(root, 'work'), temporary = join(root, 'temporary')
  await mkdir(work); await mkdir(temporary)
  await ctx.plugin(TargetProtection, { path: join(root, 'rules.sqlite'), hostsFile: '' })
  const snapshot = await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [
    { id: '4df071d9-85dd-40a2-adc0-016e30534528' as TargetRuleId, name: 'test', enabled: true, kind: 'server',
      environment: 'test', protection: 'full', match: 'host', address: '127.0.0.1', port: ports[0]! },
    { id: '2e3a017d-ef02-427f-9c7f-860bed4d8148' as TargetRuleId, name: 'production', enabled: true, kind: 'server',
      environment: 'production', protection: 'full', match: 'host', address: '127.0.0.1', port: ports[1]! },
  ] }, 1)
  const files = await compileNativeFilePolicy(await ctx.targetProtection.nativeFileConstraints(), {
    readonlyPaths: [root, dirname(process.execPath), fileURLToPath(new URL('../../../..', import.meta.url))],
    readwritePaths: [work, temporary], maxEntries: 1000, maxPaths: 200,
  }, new AbortController().signal)
  const source = `const http=require('node:http'),net=require('node:net');
const ports=${JSON.stringify(ports)};
async function via(port){return new Promise((resolve,reject)=>{const req=http.request(process.env.HTTP_PROXY,
{path:'http://127.0.0.1:'+port+'/',headers:{host:'127.0.0.1:'+port}},res=>{let body='';res.on('data',x=>body+=x);res.on('error',reject);
res.on('end',()=>resolve({status:res.statusCode,body}))});req.on('error',reject);req.end()})}
async function bypass(port){return new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');
socket.on('connect',()=>{socket.destroy();resolve('CONNECTED')});socket.on('error',error=>{socket.destroy();resolve(error.code)})})}
(async()=>{const result={test:await via(ports[0]),production:await via(ports[1]),direct:await bypass(ports[0])};
process.stdout.write(JSON.stringify(result))})().catch(error=>{process.stderr.write(String(error));process.exitCode=1});`
  const request: SubprocessSpawnSpec = { argv: [process.execPath, '-e', source], cwd: work,
    stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } }, graceMs: 1000 }
  const reports: Error[] = []
  host = createNativeHostExecution(request, async (signal) => {
    const gateway = await startNativeGateway(ctx.targetProtection, {
      revision: snapshot.revision, sessionId: SessionId('native-egress-runtime'), tool: 'shell',
      async stopExecution() {
        if (host === undefined) throw new Error('Native owner missing')
        host.launch.owner.signal('SIGKILL'); await host.launch.owner.waitForExit()
      },
      connectTimeoutMs: 3000, requestTimeoutMs: 5000, capture: { append: () => undefined }, capturePaused: () => true,
    }, signal)
    try {
      return { carrier: launchNativeBroker(request.graceMs, signal),
        environment: { SystemRoot: process.env.SystemRoot ?? '', WINDIR: process.env.WINDIR ?? '',
          SystemDrive: process.env.SystemDrive ?? '', TEMP: temporary, TMP: temporary, USERPROFILE: temporary,
          LOCALAPPDATA: temporary, HTTP_PROXY: gateway.url },
        config: { cwd: work, temporaryRoot: temporary, files: { readonlyPaths: files.readonlyPaths, readwritePaths: files.readwritePaths,
          deniedPaths: files.deniedPaths, enumeratePaths: files.enumeratePaths },
        proxyUrl: gateway.url, startupTimeoutMs: 10_000, timeoutMs: 20_000 },
        release: () => gateway.close(),
      }
    } catch (error) { await gateway.close(); throw error }
  }, 4096, (error) => { reports.push(error) })
  const handle = bindManagedProcess(request, host.launch, {})
  expect(await handle.done).toEqual({ exitCode: 0, signal: null })
  expect(await handle.waitForExit(AbortSignal.timeout(30_000))).toBe(true)
  await host.settled
  expect(JSON.parse(handle.collected.stdout!.readFrom(0).text)).toMatchObject({
    test: { status: 200, body: 'allowed test response' }, production: { status: 403 }, direct: 'EACCES',
  })
  expect(connections).toEqual([1, 0])
  expect(reports).toEqual([])
  const changed = await ctx.targetProtection.configure({ mainlandEnabled: false, rules: [] }, snapshot.revision)
  expect(changed.revision).toBe(snapshot.revision + 1)
})
