/** Disposable SSH protocol peer with per-test credentials and owned listeners. @module */
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import ssh2 from 'ssh2'
import type { Connection, ServerChannel } from 'ssh2'
import type { Duplex } from 'node:stream'
import { createServer, type Socket } from 'node:net'
import type { Config } from '../../src/direct.ts'
import { SshRpcPeer } from '../../src/protocol.ts'

export const hello = { protocol: 2, hash: 'a'.repeat(64), platform: 'linux', nodeVersion: 'fixture',
  kind: 'node-script', executable: '/fixture/node', root: '/fixture/streams', workspace: '/fixture/workspace' }

/**
 * Create an owned protocol peer and an isolated credential context.
 * @param options - Deliberate peer behavior for the current scenario.
 * @returns Listener facts, request observations and idempotent asynchronous cleanup.
 */
export async function createSshFixture(options: {
  hello?: object
  holdExec?: boolean
  holdStream?: boolean
  exitBeforeHello?: number
  forwardStream?: () => Duplex
  handle?: (method: string, params: unknown, signal: AbortSignal, root: string) => Promise<unknown>
} = {}) {
  const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'sec1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey
  const parsed = ssh2.utils.parseKey(key)
  if (parsed instanceof Error) throw parsed
  const fingerprint = createHash('sha256').update(parsed.getPublicSSH()).digest('hex')
  const root = await mkdtemp(join(tmpdir(), 'dshu-direct-ssh-'))
  const ctx = new Context(), connections = new Set<Connection>(), peers = new Set<SshRpcPeer>()
  const requests: string[] = [], commands: string[] = []
  const pending = new Set<Promise<unknown>>()
  const forwards = new Map<Duplex, Promise<void>>()
  const sockets = new Set<Socket>()
  const execEntered = Promise.withResolvers<boolean>(), streamEntered = Promise.withResolvers<boolean>()
  const password = randomUUID()
  const reference = credentialRef(`SSH_FIXTURE_${randomUUID().replaceAll('-', '_')}`)
  let connected = 0
  const server = new ssh2.Server({ hostKeys: [key] }, (connection) => {
    connections.add(connection)
    connection.on('error', () => {})
    connection.on('close', () => { connections.delete(connection) })
    connection.on('authentication', (auth) => {
      if (auth.method === 'password' && auth.username === 'fixture' && auth.password === password) auth.accept()
      else auth.reject()
    })
    connection.on('session', (accept) => {
      const session = accept()
      session.on('exec', (accept, _reject, info) => {
        commands.push(info.command); execEntered.resolve(true)
        if (options.holdExec) return
        const channel: ServerChannel = accept()
        if (options.exitBeforeHello !== undefined) {
          channel.exit(options.exitBeforeHello); channel.end(); return
        }
        const peer = new SshRpcPeer(channel, channel, 65536, 16, async (method, params, signal) => {
          requests.push(method)
          if (method === 'hello') return { ...hello, ...options.hello }
          if (method === 'echo') return params
          if (method === 'heartbeat' || method === 'close') return null
          if (options.handle !== undefined) {
            const operation = options.handle(method, params, signal, root)
            pending.add(operation)
            try { return await operation } finally { pending.delete(operation) }
          }
          throw new Error(`Fixture operation is unsupported: ${method}`)
        })
        peers.add(peer)
        peer.on('closed', () => { peers.delete(peer) })
      })
    })
    connection.on('openssh.streamlocal', (accept, reject) => {
      streamEntered.resolve(true)
      if (options.forwardStream !== undefined) {
        const channel = accept(), stream = options.forwardStream()
        const closed = new Promise<void>((resolve) => { stream.once('close', () => { forwards.delete(stream); resolve() }) })
        forwards.set(stream, closed)
        channel.on('error', () => { stream.destroy() }); stream.on('error', () => { channel.destroy() })
        channel.once('close', () => { stream.destroy() }); stream.once('close', () => { channel.destroy() })
        channel.pipe(stream).pipe(channel)
        return
      }
      if (!options.holdStream) reject()
    })
  })
  const listener = createServer((socket) => {
    connected++; sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => { sockets.delete(socket) })
    server.injectSocket(socket)
  })
  let disposal: Promise<void> | undefined
  const close = (): Promise<void> => disposal ??= (async () => {
    const closed = listener.listening ? new Promise<void>((resolve, reject) => {
      listener.close((error) => { if (error === undefined) resolve(); else reject(error) })
    }) : Promise.resolve()
    try { await ctx.fiber.dispose() }
    finally {
      for (const peer of peers) peer.close()
      await Promise.allSettled([...pending])
      for (const stream of forwards.keys()) stream.destroy()
      await Promise.allSettled([...forwards.values()])
      for (const connection of connections) connection.end()
      for (const socket of sockets) socket.destroy()
      await closed
      await rm(root, { recursive: true, force: true })
    }
  })()
  try {
    await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
    const address = listener.address()
    if (address === null || typeof address === 'string') throw new Error('Fixture listener did not bind an IP port')
    await ctx.plugin(Credentials, { path: join(root, 'credentials.yaml'), dshHome: root, watch: false })
    await ctx.credentials.set(reference, password)
    const config = { hostname: '127.0.0.1', port: address.port, username: 'fixture', hostKeySha256: fingerprint,
      passwordRef: reference, helper: '/fixture/helper.js', helperHash: hello.hash,
      launch: { kind: 'node-script', node: '/fixture/node' }, workspace: '/fixture/workspace',
      maxFrameBytes: 65536, maxPending: 16, requestTimeoutMs: 5000, leaseMs: 30000 } satisfies Config
    return { ctx, root, config, requests, commands, close, connected: () => connected,
      execEntered: execEntered.promise, streamEntered: streamEntered.promise }
  } catch (error) { await close(); throw error }
}
