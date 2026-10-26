/** Real local DNS packets exercise transaction binding, name chains, truncation and cancellation. @module */
import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { createServer, type Server, type Socket } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as packet from 'dns-packet'
import { afterEach, expect, it } from 'vitest'
import { resolveTargetDns, type TargetDnsOptions } from '../src/dns-resolution.ts'
import { canonicalDnsName } from '../src/rules.ts'

const udpServers: UdpSocket[] = [], tcpServers: Server[] = [], sockets = new Set<Socket>(), roots: string[] = []
afterEach(async () => {
  for (const socket of sockets) socket.destroy()
  await Promise.all(udpServers.splice(0).map(server => new Promise<void>((resolve) => { server.close(resolve) })))
  await Promise.all(tcpServers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })))
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

type Reply = (query: packet.DecodedPacket, tcp: boolean) => packet.Packet | null
async function fixture(reply: Reply, withTcp = false): Promise<TargetDnsOptions> {
  const udp = createSocket('udp4'); udpServers.push(udp)
  let port: number
  if (withTcp) {
    const tcp = createServer((socket) => {
      sockets.add(socket); socket.on('close', () => { sockets.delete(socket) }); socket.on('error', () => {})
      let data = Buffer.alloc(0)
      socket.on('data', (chunk: Buffer) => {
        data = Buffer.concat([data, chunk])
        if (data.length < 2 || data.length < data.readUInt16BE(0) + 2) return
        const response = reply(packet.decode(data.subarray(2)), true)
        if (response !== null) socket.end(packet.streamEncode(response))
      })
    })
    tcpServers.push(tcp)
    await new Promise<void>((resolve) => { tcp.listen(0, '127.0.0.1', resolve) })
    const address = tcp.address()
    if (address === null || typeof address === 'string') throw new Error('Missing fixture address')
    port = address.port
  } else port = 0
  await new Promise<void>((resolve) => { udp.bind(port, '127.0.0.1', resolve) })
  port = udp.address().port
  udp.on('message', (bytes, remote) => {
    const response = reply(packet.decode(bytes), false)
    if (response !== null) udp.send(packet.encode(response), remote.port, remote.address)
  })
  return { servers: [`127.0.0.1:${String(port)}`], hostsFile: '', queryTimeoutMs: 1000,
    maxCnameDepth: 8, maxRecords: 32, maxHostsBytes: 4096 }
}

function response(query: packet.DecodedPacket, answers: packet.Answer[] = []): packet.Packet {
  return { type: 'response', id: query.id, questions: query.questions, flags: packet.RECURSION_AVAILABLE, answers }
}
function addresses(query: packet.DecodedPacket, name = 'resolved.test'): packet.Answer[] {
  return query.questions?.[0]?.type === 'A' ? [{ type: 'A', name, data: '192.0.2.10', ttl: 1 }]
    : [{ type: 'AAAA', name, data: '2001:db8::10', ttl: 1 }]
}

it('retains the exact CNAME chain and excludes unrelated address records', async () => {
  const options = await fixture(query => response(query, [
    { type: 'CNAME', name: 'entry.test', data: 'resolved.test', ttl: 1 }, ...addresses(query),
    { type: 'A', name: 'unrelated.test', data: '192.0.2.99', ttl: 1 },
  ]))
  const result = await resolveTargetDns('entry.test', options, AbortSignal.timeout(3000))
  expect(result.names).toEqual(['entry.test', 'resolved.test'])
  expect(result.addresses.map(item => item.address)).toEqual(['192.0.2.10', '2001:db8::10'])
})

it('follows a CNAME-only answer and preserves numeric DNS labels', async () => {
  const options = await fixture(query => response(query, query.questions?.[0]?.name === 'entry.test'
    ? [{ type: 'CNAME', name: 'entry.test', data: '0x7f000001', ttl: 1 }]
    : addresses(query, '0x7f000001')))
  const result = await resolveTargetDns('entry.test', options, AbortSignal.timeout(3000))
  expect(canonicalDnsName('0x7f000001')).toBe('0x7f000001')
  expect(result.names).toEqual(['entry.test', '0x7f000001'])
  expect(result.addresses[0]?.address).toBe('192.0.2.10')
})

it('uses TCP to replace a truncated UDP reply', async () => {
  let tcpCalls = 0
  const options = await fixture((query, tcp) => {
    if (!tcp) return { ...response(query), flags: packet.TRUNCATED_RESPONSE }
    tcpCalls++
    return response(query, addresses(query, 'entry.test'))
  }, true)
  const result = await resolveTargetDns('entry.test', options, AbortSignal.timeout(3000))
  expect(result.addresses).toHaveLength(2)
  expect(tcpCalls).toBe(2)
})

it('rejects cyclic or conflicting aliases', async () => {
  const cyclic = await fixture(query => response(query, [{ type: 'CNAME', name: 'entry.test', data: 'entry.test', ttl: 1 }]))
  await expect(resolveTargetDns('entry.test', cyclic, AbortSignal.timeout(3000))).rejects.toThrow()
  const conflict = await fixture(query => response(query, [
    { type: 'CNAME', name: 'entry.test', data: 'one.test', ttl: 1 }, { type: 'CNAME', name: 'entry.test', data: 'two.test', ttl: 1 },
  ]))
  await expect(resolveTargetDns('entry.test', conflict, AbortSignal.timeout(3000))).rejects.toThrow()
})

it('rejects mismatched questions and closes a cancelled unanswered exchange', async () => {
  const wrong = await fixture(query => ({ ...response(query), questions: [{ name: 'other.test', type: 'A', class: 'IN' }] }))
  await expect(resolveTargetDns('entry.test', wrong, AbortSignal.timeout(3000))).rejects.toThrow()
  const reached = Promise.withResolvers<boolean>()
  const silent = await fixture(() => { reached.resolve(true); return null })
  const abort = new AbortController()
  const operation = resolveTargetDns('entry.test', silent, abort.signal)
  const rejected = expect(operation).rejects.toThrow('cancel fixture')
  await reached.promise; abort.abort(new Error('cancel fixture'))
  await rejected
})

it('uses hosts-file aliases and IP literals without DNS traffic', async () => {
  let queries = 0
  const options = await fixture((query) => { queries++; return response(query) })
  const root = await mkdtemp(join(tmpdir(), 'dshu-hosts-')); roots.push(root)
  const hostsFile = join(root, 'hosts')
  await writeFile(hostsFile, '192.0.2.10 local.test alias.test\n2001:db8::10 local.test\n')
  const local = await resolveTargetDns('local.test', { ...options, hostsFile }, AbortSignal.timeout(3000))
  expect(local.source).toBe('hosts')
  expect(local.names).toEqual(['local.test', 'alias.test'])
  expect(local.addresses).toHaveLength(2)
  const literal = await resolveTargetDns('[::ffff:192.0.2.10]', options, AbortSignal.timeout(3000))
  expect(literal.addresses).toEqual([{ address: '192.0.2.10', family: 4 }])
  expect((await resolveTargetDns('service.localhost', options, AbortSignal.timeout(3000))).source).toBe('localhost')
  expect(queries).toBe(0)
})

it('does not evade a resolver refusal by asking another resolver', async () => {
  let fallbackQueries = 0
  const denied = await fixture(query => ({ ...response(query), flags: 3 }))
  const fallback = await fixture((query) => { fallbackQueries++; return response(query, addresses(query, 'entry.test')) })
  await expect(resolveTargetDns('entry.test', { ...denied, servers: [...denied.servers, ...fallback.servers] }, AbortSignal.timeout(3000))).rejects.toThrow()
  expect(fallbackQueries).toBe(0)
})
