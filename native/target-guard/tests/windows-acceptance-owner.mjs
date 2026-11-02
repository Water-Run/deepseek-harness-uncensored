/** Owned acceptance worker; no user profile, credentials, model calls or non-local targets. */
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn as launch } from 'node:child_process'

const [kind, helper, canary] = process.argv.slice(2)
if (!['baseline', 'guarded', 'orphan'].includes(kind) || !helper || !/^\d+$/u.test(canary ?? '') || !process.send) {
  throw new Error('Private acceptance worker arguments are required')
}
const repository = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(new URL('../../../packages/guard/target-protection/package.json', import.meta.url))
const load = async name => import(pathToFileURL(require.resolve(name)).href)
const { spawn } = await load('@microsoft/mxc-sdk/v1')
const { attachObservedWindowsJob, buildCommandLine, currentWindowsProcessIdentity, observedWindowsBootstrapPath } = await load('@deepseek-ai/dsh-win32-process')
const { readNativeBootstrapIdentity } = await import('../../../packages/guard/target-protection/lib/types/native-bootstrap.js')
const { startNativeIngress } = await import('../../../packages/guard/target-protection/lib/types/native-ingress.js')
const root = await mkdtemp(join(tmpdir(), 'dshu-guard-acceptance-'))
const identity = currentWindowsProcessIdentity()
process.send({ type: 'workspace', root, owner: { pid: identity.pid, created: String(identity.creationTime) } })
let native, job, lease, guardProcess, closing
const cleanup = () => closing ??= (async () => {
  job?.terminate(1); native?.kill()
  if (native) await native.wait()
  if (job && !await job.waitForExit(10, AbortSignal.timeout(10000))) throw new Error('Target range did not stop')
  try { await lease?.release() } finally { job?.close(); native?.dispose() }
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})()
const deadline = setTimeout(() => { void cleanup().finally(() => process.exit(1)) }, 45000)
process.once('disconnect', () => { void cleanup().finally(() => process.exit(1)) })
process.on('message', (message) => {
  if (message === 'crash' && kind === 'orphan' && guardProcess?.pid) {
    guardProcess.kill('SIGKILL')
    process.exit(0)
  }
  if (message === 'finish') void cleanup().then(() => {
    clearTimeout(deadline); process.send?.({ type: 'finished' }); process.disconnect(); process.exit(0)
  }, (error) => { process.send?.({ type: 'error', message: String(error) }); process.exit(1) })
})
try {
  const temporary = join(root, 'private'), entry = join(root, 'workload.mjs')
  await mkdir(temporary)
  await writeFile(entry, `import{createServer,connect}from'node:net';import{createSocket}from'node:dgram';
export async function runNativeWorker(input,output){
 const tcp4=createServer(s=>s.on('data',()=>s.end('owned'))),tcp6=createServer(s=>s.on('data',()=>s.end('owned')));
 const udp4=createSocket('udp4'),udp6=createSocket('udp6');
 for(const s of [tcp4,tcp6])s.on('connection',c=>c.on('error',()=>c.destroy()));
 for(const s of [udp4,udp6])s.on('message',(_,r)=>s.send('owned',r.port,r.address));
 await Promise.all([new Promise(r=>tcp4.listen(0,'127.0.0.1',r)),new Promise(r=>tcp6.listen(0,'::1',r)),new Promise(r=>udp4.bind(0,'127.0.0.1',r)),new Promise(r=>udp6.bind(0,'::1',r))]);
 const egress=await new Promise((r,j)=>{const s=connect(${canary},'127.0.0.1');s.on('error',j);s.on('data',b=>r(b.toString()));s.on('end',()=>s.destroy());s.write('probe')});
 output.write(JSON.stringify({tcp4:tcp4.address().port,tcp6:tcp6.address().port,udp4:udp4.address().port,udp6:udp6.address().port,egress})+'\\n');
 await new Promise(r=>input.on('end',r));for(const s of [tcp4,tcp6])s.close();udp4.close();udp6.close();}
`)
  const parents = []
  for (const grant of [root, repository, dirname(process.execPath)]) {
    for (let path = dirname(grant); ; path = dirname(path)) { if (!parents.includes(path)) parents.push(path); if (path === dirname(path)) break }
  }
  const nonce = randomUUID()
  native = await spawn({ command: buildCommandLine(process.execPath, [observedWindowsBootstrapPath(), nonce, pathToFileURL(entry).href, '', '', temporary]),
    workingDirectory: root, containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: parents } } },
    filesystem: { readonlyPaths: [repository, root, dirname(process.execPath)], readwritePaths: [temporary] },
    network: { egress: { default: 'allow' }, ingress: { default: 'allow', hostLoopback: 'allow' } },
    ui: { disable: false, clipboard: 'none', allowInputInjection: false }, timeoutMs: 40000,
    environment: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
      TEMP: temporary, TMP: temporary, LOCALAPPDATA: temporary, USERPROFILE: temporary },
  }, { telemetry: { enabled: false } })
  const input = native.standardInput, output = native.standardOutput, errors = native.standardError
  if (!input || !output || !errors) throw new Error('Missing SDK streams')
  let diagnostics = ''
  errors.on('data', (bytes) => { diagnostics += bytes.toString().slice(0, 8192 - diagnostics.length) })
  const target = await readNativeBootstrapIdentity(output, nonce, native.id, AbortSignal.timeout(10000))
  job = attachObservedWindowsJob(target)
  if (kind !== 'baseline') lease = await startNativeIngress({ executable: helper, requestTimeoutMs: 10000,
    shutdownTimeoutMs: 10000, pollIntervalMs: 10, diagnosticMaxBytes: 4096 }, job, target, new AbortController().signal,
  (config, args) => {
    guardProcess = launch(config.executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive } })
    return guardProcess
  })
  if (kind === 'orphan') {
    process.send({ type: 'ready', scope: lease.id, target: { pid: target.pid, created: String(target.creationTime) } })
  } else {
    const ready = new Promise((resolve, reject) => {
      let bytes = ''
      output.on('data', (chunk) => { bytes += chunk; if (bytes.includes('\n')) { try { resolve(JSON.parse(bytes.split('\n')[0])) } catch (error) { reject(error) } } })
      output.once('end', () => { reject(new Error(`Target exited before network readiness: ${diagnostics}`)) })
    })
    input.write(Uint8Array.of(1)); output.resume()
    process.send({ type: 'ready', scope: lease?.id, ports: await ready })
  }
} catch (error) {
  process.send?.({ type: 'error', message: String(error) })
  try { await cleanup() } catch (cleanupError) { process.send?.({ type: 'error', message: String(cleanupError) }) }
  process.exit(1)
}
