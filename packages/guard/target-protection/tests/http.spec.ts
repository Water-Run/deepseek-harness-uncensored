/** Real HTTP effects through the durable policy owner and mandatory consumer. @module */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as HttpFetch from '@deepseek-ai/dsh-web-fetch-http'
import { afterEach, expect, it, vi } from 'vitest'
import TargetProtection from '../src/index.ts'
import * as ProtectedHttp from '../src/http.ts'
import type { TargetRule, TargetRuleId } from '../src/types.ts'

const contexts: Context[] = [], servers: Server[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })))
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

function rule(overrides: Partial<TargetRule> = {}): TargetRule {
  return { id: brandString<TargetRuleId>(randomUUID()), name: 'owned test endpoint', enabled: true, kind: 'server',
    environment: 'production', protection: 'full', match: 'host', address: '127.0.0.1', ...overrides }
}

async function harness(holdResponse = false) {
  const root = await mkdtemp(join(tmpdir(), 'dshu-target-http-')); roots.push(root)
  let requests = 0, connections = 0
  const reached = Promise.withResolvers<boolean>(), closed = Promise.withResolvers<boolean>()
  const server = createServer((_req, response) => {
    requests++; response.writeHead(200, { 'content-type': 'text/plain' })
    response.once('close', () => { closed.resolve(true) })
    if (holdResponse) { response.write('pending'); reached.resolve(true) }
    else response.end('fixture')
  })
  servers.push(server)
  server.on('connection', () => { connections++ })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  // Only the existing SSRF resolver is substituted; target policy and the transport remain real.
  vi.spyOn(HttpFetch, 'resolvePublicAddresses').mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(WebRuntime)
  const path = join(root, 'rules.sqlite')
  const policy = ctx.plugin(TargetProtection, { path })
  await policy
  await ctx.plugin(ProtectedHttp, {})
  const configure = async (rules: TargetRule[], mainlandEnabled = false) => {
    const current = await ctx.targetProtection.snapshot()
    return ctx.targetProtection.configure({ mainlandEnabled, rules }, current.revision)
  }
  return { ctx, path, policy, configure, reached: reached.promise, closed: closed.promise, url: `http://127.0.0.1:${String(port)}/`,
    requests: () => requests, connections: () => connections }
}

it('blocks full protection before socket creation and permits an explicit test endpoint', async () => {
  const h = await harness()
  const production = rule()
  await h.configure([production])
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.connections()).toBe(0)
  await h.configure([rule({ environment: 'test' })], true)
  expect((await h.ctx.web.fetch({ url: h.url })).body.content).toBe('fixture')
  expect(h.requests()).toBe(1)
})

it('cancels and drains a live response when the required policy owner is withdrawn', async () => {
  const h = await harness(true)
  await h.configure([])
  const operation = h.ctx.web.fetch({ url: h.url })
  const rejected = expect(operation).rejects.toBeDefined()
  await h.reached
  await h.policy.dispose()
  await rejected
  await h.closed
  expect(h.requests()).toBe(1)
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
})

it('does not infer safe audit permission from the GET method', async () => {
  const h = await harness()
  await h.configure([rule({ protection: 'audit' })])
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_READ_ONLY' })
  expect(h.connections()).toBe(0)
})

it('blocks direct IP access to the verified address of a protected hostname', async () => {
  const h = await harness()
  await h.configure([rule({ address: 'localhost' })])
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.connections()).toBe(0)
})

it('does not silently permit requests when the stored policy is damaged', async () => {
  const h = await harness()
  await h.configure([])
  const db = new DatabaseSync(h.path)
  try { db.prepare('UPDATE preferences SET value=?').run('{invalid') } finally { db.close() }
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_PROTECTION_UNAVAILABLE' })
  expect(h.connections()).toBe(0)
})

it('withdraws the consumer when protection unloads and restores it only with a usable owner', async () => {
  const h = await harness()
  await h.configure([])
  const protection = h.ctx.targetProtection
  await h.policy.dispose()
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })
  expect(() => protection.checkHttp({ origin: h.url, hostname: '127.0.0.1', port: 80, phase: 'before-resolution', route: 'direct' },
    new AbortController().signal)).toThrow(expect.objectContaining({ code: 'unavailable' }))
  expect(h.connections()).toBe(0)
  await h.ctx.plugin(TargetProtection, { path: h.path })
  await h.ctx.fiber.await()
  expect((await h.ctx.web.fetch({ url: h.url })).body.content).toBe('fixture')
  expect(h.requests()).toBe(1)
})

it('checks the committed revision after an earlier policy callback changes the rules', async () => {
  const h = await harness()
  await h.configure([])
  h.ctx.on('web-fetch/authorize', async (destination) => {
    if (destination.phase === 'before-connect') await h.configure([rule()])
    return undefined
  })
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_POLICY_CHANGED' })
  expect(h.connections()).toBe(0)
})

it('reports request cancellation while policy is pending without opening a connection', async () => {
  const h = await harness()
  await h.configure([])
  const reached = Promise.withResolvers<boolean>(), release = Promise.withResolvers<boolean>()
  h.ctx.on('web-fetch/authorize', async () => { reached.resolve(true); await release.promise; return undefined })
  const abort = new AbortController()
  const request = h.ctx.web.fetch({ url: h.url }, abort.signal)
  const rejected = expect(request).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  try { await reached.promise; abort.abort() } finally { release.resolve(true) }
  await rejected
  expect(h.connections()).toBe(0)
})
