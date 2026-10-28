/** Real SSH authentication and helper RPC over disposable loopback servers. @module */
import { expect, it, vi } from 'vitest'
import { z } from 'zod'
import Direct from '../../src/direct.ts'
import { harness, hello } from './fixture.ts'
import { Context } from '@deepseek-ai/cordis'
import { SshFileSystem } from '@deepseek-ai/dsh-fs-ssh'
import { FsTargetKey } from '@deepseek-ai/dsh-fs'
import { onTestFinished } from 'vitest'
import { createServer } from 'node:tls'
import { connect, type Socket } from 'node:net'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'
import { SSH_STREAM_TLS_OPTIONS } from '../../src/stream-security.ts'

async function streamFixture() {
  const capability = randomBytes(32), sockets = new Set<Socket>()
  const server = createServer({ ...SSH_STREAM_TLS_OPTIONS,
    pskCallback: (_socket, identity) => identity === 'dsh-stream' ? capability : null,
  }, (socket) => { socket.on('error', () => {}); socket.pipe(socket) })
  server.on('connection', (socket: Socket) => { sockets.add(socket); socket.once('close', () => { sockets.delete(socket) }) })
  server.on('tlsClientError', () => {})
  onTestFinished(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('TLS fixture address missing')
  const h = await harness({ forwardStream: () => connect({ host: '127.0.0.1', port: address.port }) })
  return { ...h, capability: capability.toString('hex') }
}

it('authenticates independent streams and keeps them usable after the establishment deadline', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const h = await streamFixture()
    await h.ctx.plugin(Direct, h.config)
    const stream = await h.ctx.ssh.connectStream({ path: '/fixture/streams/control', capability: h.capability })
    expect(stream.isPaused()).toBe(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(stream.destroyed).toBe(false)
    const received = once(stream, 'data')
    stream.resume(); stream.write('stream payload')
    expect(String((await received)[0])).toBe('stream payload')
    stream.destroy()
  } finally { vi.useRealTimers() }
})

it('rejects an incorrect stream capability without compromising the administrative channel', async () => {
  const h = await streamFixture()
  await h.ctx.plugin(Direct, h.config)
  await expect(h.ctx.ssh.connectStream({ path: '/fixture/streams/control', capability: '0'.repeat(64) })).rejects.toBeDefined()
  expect(await h.ctx.ssh.request('echo', 'still authenticated', z.string())).toBe('still authenticated')
})

it('keeps remote file URIs in the POSIX execution world on every client platform', () => {
  const ctx = new Context(); onTestFinished(() => ctx.fiber.dispose())
  const fs = new SshFileSystem(ctx)
  expect(fs.fileUrl({ displayPath: '/remote/a b#c', targetKey: FsTargetKey('/remote/a b#c') }))
    .toBe('file:///remote/a%20b%23c')
})

it('authenticates a pinned server and serves existing consumers without invoking local OpenSSH', async () => {
  const h = await harness()
  const fiber = await h.ctx.plugin(Direct, h.config)
  expect(await h.ctx.ssh.ready).toMatchObject(hello)
  expect(await h.ctx.ssh.request('echo', { value: 42 }, z.object({ value: z.number() }))).toEqual({ value: 42 })
  expect(h.commands).toHaveLength(1)
  expect(h.commands[0]).toContain('sha256sum')
  expect(h.commands[0]).toContain('exit 78; exec')
  expect(h.commands[0]).not.toContain(h.config.passwordRef)
  const stale = h.ctx.ssh
  await fiber.dispose()
  expect(h.requests).toContain('close')
  await expect(stale.request('echo', {}, z.object({}))).rejects.toMatchObject({ code: 'SSH_UNAVAILABLE' })
})

it('rejects an unpinned host key before authentication or helper execution', async () => {
  const h = await harness()
  await expect(h.ctx.plugin(Direct, { ...h.config, hostKeySha256: '0'.repeat(64) })).rejects.toBeDefined()
  expect(h.connected()).toBe(1)
  expect(h.commands).toEqual([])
  expect(h.requests).toEqual([])
})

it('accepts a standard OpenSSH SHA256 fingerprint without automatic key trust', async () => {
  const h = await harness()
  const fingerprint = `SHA256:${Buffer.from(h.config.hostKeySha256, 'hex').toString('base64').replace(/=$/u, '')}`
  await h.ctx.plugin(Direct, { ...h.config, hostKeySha256: fingerprint })
  expect(await h.ctx.ssh.request('echo', 'pinned', z.string())).toBe('pinned')
})

it('rejects invalid fingerprint and credential-reference formats before connecting', async () => {
  const h = await harness()
  await expect(h.ctx.plugin(Direct, { ...h.config, hostKeySha256: 'SHA256:invalid' })).rejects.toBeDefined()
  await expect(h.ctx.plugin(Direct, { ...h.config, passwordRef: 'accidentally pasted secret' })).rejects.toBeDefined()
  expect(h.connected()).toBe(0)
})

it('rejects an unavailable credential before making a TCP connection', async () => {
  const h = await harness()
  await expect(h.ctx.plugin(Direct, { ...h.config, passwordRef: 'SSH_UNSET_FIXTURE' })).rejects.toBeDefined()
  expect(h.connected()).toBe(0)
})

it('rejects a mismatched helper identity before publishing readiness', async () => {
  const h = await harness({ hello: { hash: 'b'.repeat(64) } })
  await expect(h.ctx.plugin(Direct, h.config)).rejects.toBeDefined()
  expect(h.requests).toEqual(['hello'])
})

it('settles a checksum refusal received before the helper RPC reader starts', async () => {
  const h = await harness({ exitBeforeHello: 78 })
  await expect(h.ctx.plugin(Direct, h.config)).rejects.toMatchObject({ code: 'SSH_IDENTITY_MISMATCH' })
  expect(h.requests).toEqual([])
})

it('stops a pending helper launch and closes its transport when the provider is withdrawn', async () => {
  const h = await harness({ holdExec: true })
  const fiber = h.ctx.plugin(Direct, h.config)
  const failed = expect(fiber).rejects.toBeDefined()
  await h.execEntered
  await fiber.dispose()
  await failed
  expect(h.commands).toHaveLength(1)
})

it('closes an unacknowledged forwarding allocation on cancellation', async () => {
  const h = await harness({ holdStream: true })
  await h.ctx.plugin(Direct, h.config)
  const controller = new AbortController()
  const pending = h.ctx.ssh.connectStream({ path: '/fixture/streams/control', capability: 'c'.repeat(64) }, controller.signal)
  const failed = expect(pending).rejects.toBeDefined()
  await h.streamEntered
  controller.abort()
  await failed
  await expect(h.ctx.ssh.request('echo', {}, z.object({}))).rejects.toBeDefined()
})

it('refuses forwarding paths outside the verified helper directory', async () => {
  const h = await harness()
  await h.ctx.plugin(Direct, h.config)
  await expect(h.ctx.ssh.connectStream({ path: '/fixture/streams/../other', capability: 'c'.repeat(64) }))
    .rejects.toMatchObject({ code: 'SSH_IDENTITY_UNVERIFIED' })
})
