/** Manual Windows characterization using owned TCP listeners; no firewall policy changes. @module */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, dirname, sep } from 'node:path'
import { tmpdir, networkInterfaces } from 'node:os'
import { spawn as spawnHost } from 'node:child_process'
import { connect, createServer } from 'node:net'
import assert from 'node:assert/strict'

if (process.platform !== 'win32') throw new Error('This characterization requires Windows.')
const require = createRequire(new URL('../../package.json', import.meta.url))
const sdkPackage = require('@microsoft/mxc-sdk/package.json')
const { spawn, probe } = await import(pathToFileURL(require.resolve('@microsoft/mxc-sdk/v1')).href)
const root = await mkdtemp(join(tmpdir(), 'dshu-ingress-matrix-'))
const proxySockets = new Set()
const proxy = createServer((socket) => {
  proxySockets.add(socket)
  socket.once('close', () => { proxySockets.delete(socket) })
  socket.on('error', () => { socket.destroy() })
  socket.end('owned proxy')
})

async function attempt(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    let result = 'timeout'
    socket.on('connect', () => { result = 'connected'; socket.end() })
    socket.on('data', () => {})
    socket.on('error', (error) => { result = error.code; socket.destroy() })
    socket.setTimeout(750, () => { socket.destroy() })
    socket.on('close', () => { resolve({ host, port, result }) })
  })
}

try {
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve) })
  const proxyPort = proxy.address().port
  const file = join(root, 'probe.mjs')
  await writeFile(file, await readFile(new URL('./native-network-workload.mjs', import.meta.url)))
  await mkdir(join(root, 'temp'))
  const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, SystemDrive: process.env.SystemDrive,
    TEMP: join(root, 'temp'), TMP: join(root, 'temp'), LOCALAPPDATA: join(root, 'temp'), USERPROFILE: join(root, 'temp') }
  const ancestors = []
  for (let path = dirname(root); ; path = dirname(path)) {
    ancestors.push(path)
    if (path === dirname(path)) break
  }
  const request = {
    command: `"${process.execPath}" "${file}" ${proxyPort}`, workingDirectory: root,
    containment: { type: 'processcontainer', config: { filesystem: { enumeratePaths: ancestors } } },
    filesystem: { readonlyPaths: [root, dirname(process.execPath)], readwritePaths: [join(root, 'temp')] },
    network: { egress: { default: 'deny' }, ingress: { default: 'deny', hostLoopback: 'deny' } },
    ui: { disable: false, clipboard: 'none', allowInputInjection: false }, environment: env, timeoutMs: 20000,
  }
  const evidence = { library: process.env.MXC_FFI_DIR ?? `published ${sdkPackage.version}`, probe: probe(request), results: [] }
  const local = Object.values(networkInterfaces()).flat()
    .filter(address => address && !address.internal && address.family === 'IPv4' && /^192\.168\./u.test(address.address))
    .map(address => address.address)
  const targets = [...new Set(['127.0.0.1', '::1', ...local])]
  for (const kind of ['baseline', 'deny-all', 'proxy']) {
    const policy = kind === 'proxy' ? { ...request, network: { egress: { default: 'deny' },
      ingress: { default: 'allow', hostLoopback: 'allow' }, runtimeConfig: { networkProxy: `http://127.0.0.1:${proxyPort}` } } } : request
    let child
    try {
      child = kind === 'baseline'
        ? spawnHost(process.execPath, [file, String(proxyPort)], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        : await spawn(policy, { telemetry: { enabled: false } })
    } catch (error) {
      evidence.results.push({ kind, startupFailure: String(error) })
      process.exitCode = 1
      continue
    }
    const out = kind === 'baseline' ? child.stdout : child.standardOutput
    const err = kind === 'baseline' ? child.stderr : child.standardError
    const input = kind === 'baseline' ? child.stdin : child.standardInput
    // The SDK must publish stdout/stderr before wait() takes ownership of unused streams.
    const ended = kind === 'baseline'
      ? new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (exitCode, signal) => { resolve({ exitCode, signal }) })
      }) : child.wait()
    void ended.catch(() => {}) // The readiness/exit owner reports startup failures below.
    let stderr = '', text = '', timer
    err.on('data', (bytes) => { stderr += bytes })
    input.on('error', (error) => { stderr += String(error) })
    try {
      const data = await new Promise((resolve, reject) => {
        timer = setTimeout(() => { reject(new Error(`Readiness deadline: ${stderr}`)) }, 12000)
        child.on?.('error', reject)
        out.on('data', (bytes) => {
          text += bytes
          if (!text.includes('\n')) return
          try { resolve(JSON.parse(text.split('\n')[0])) } catch (error) { reject(error) }
        })
      })
      clearTimeout(timer)
      const attempts = []
      for (const server of data.ready) {
        if (!server.port) continue
        for (const host of targets) {
          if (server.host === '0.0.0.0' && host === '::1') continue
          attempts.push(await attempt(host, server.port))
        }
      }
      input.end('done')
      const result = await ended
      evidence.results.push({ kind, ...data, attempts, result, stderr })
      assert.equal(result.exitCode, 0, stderr)
      assert.notEqual(result.timedOut, true)
    } finally {
      clearTimeout(timer)
      child.kill()
      await ended
      if (kind !== 'baseline') child.dispose()
    }
  }
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  for (const socket of proxySockets) socket.destroy()
  await new Promise(resolve => proxy.close(resolve))
  assert(root.startsWith(tmpdir() + sep))
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
