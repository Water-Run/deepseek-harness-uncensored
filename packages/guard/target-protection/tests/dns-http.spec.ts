/** Name evidence reaches the actual guarded transport without a second destination lookup. @module */
import { createSocket, type Socket as DnsSocket } from 'node:dgram'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as HttpFetch from '@deepseek-ai/dsh-web-fetch-http'
import { brandString } from '@deepseek-ai/dsh-brand'
import * as packet from 'dns-packet'
import { afterEach, expect, it, vi } from 'vitest'
import TargetProtection from '../src/index.ts'
import * as ProtectedHttp from '../src/http.ts'
import type { TargetRuleId } from '../src/types.ts'

const contexts: Context[] = [], servers: Server[] = [], dnsServers: DnsSocket[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  await Promise.all(dnsServers.splice(0).map(server => new Promise<void>((resolve) => { server.close(resolve) })))
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })))
})

async function harness(alias: string | undefined) {
  let connections = 0, queries = 0, aQueries = 0
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('pinned fixture') })
  servers.push(server)
  server.on('connection', () => { connections++ })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  const dns = createSocket('udp4'); dnsServers.push(dns)
  await new Promise<void>((resolve) => { dns.bind(0, '127.0.0.1', resolve) })
  dns.on('message', (bytes, remote) => {
    queries++
    const query = packet.decode(bytes)
    const question = query.questions?.[0]
    const answers: packet.Answer[] = []
    if (question?.name === 'entry.test' && alias !== undefined) answers.push({ type: 'CNAME', name: 'entry.test', data: alias, ttl: 0 })
    if (question?.type === 'A') {
      aQueries++
      answers.push({ type: 'A', name: alias ?? 'entry.test', data: '127.0.0.1', ttl: 0 })
    }
    dns.send(packet.encode({ type: 'response', id: query.id, questions: query.questions, answers }), remote.port, remote.address)
  })
  // DNS and connection pinning stay real; only the public-only address restriction is relaxed for this owned listener.
  vi.spyOn(HttpFetch, 'resolvePublicAddresses').mockImplementation(async (host, signal, resolver) => {
    if (resolver === undefined) throw new Error('Expected the bound DNS resolver')
    const addresses = await resolver(host, { all: true, order: 'verbatim' })
    signal.throwIfAborted()
    return addresses.map(address => ({ address: address.address, family: address.family === 4 ? 4 : 6 }))
  })
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(WebRuntime)
  await ctx.plugin(TargetProtection, { path: ':memory:', hostsFile: '', dnsServers: [`127.0.0.1:${String(dns.address().port)}`] })
  await ctx.plugin(ProtectedHttp, {})
  return { ctx, url: `http://entry.test:${String(port)}/`, counts: () => ({ connections, queries, aQueries }) }
}

it('rejects a protected CNAME destination before the HTTP server receives any connection', async () => {
  const h = await harness('protected.test')
  await h.ctx.targetProtection.configure({ mainlandEnabled: false, rules: [{
    id: brandString<TargetRuleId>('9181e104-d33c-48ec-9a88-a38c595f3415'), name: 'protected alias', enabled: true,
    kind: 'domain', environment: 'production', protection: 'full', match: 'domain', address: 'protected.test',
  }] }, 1)
  await expect(h.ctx.web.fetch({ url: h.url })).rejects.toMatchObject({ code: 'TARGET_FULLY_PROTECTED' })
  expect(h.counts().connections).toBe(0)
  expect(h.counts().queries).toBeGreaterThan(0)
})

it('uses the verified address directly without repeating the A query during connection', async () => {
  const h = await harness(undefined)
  await h.ctx.targetProtection.configure({ mainlandEnabled: true, rules: [{
    id: brandString<TargetRuleId>('2053e054-15cf-4687-83b3-14f7a7547875'), name: 'owned test', enabled: true,
    kind: 'server', environment: 'test', protection: 'full', match: 'host', address: 'entry.test',
  }] }, 1)
  expect((await h.ctx.web.fetch({ url: h.url })).body.content).toBe('pinned fixture')
  expect(h.counts().connections).toBe(1)
  expect(h.counts().aQueries).toBe(1)
})
