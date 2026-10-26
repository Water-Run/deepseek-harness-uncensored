/** Bind the name chain and connection addresses from the same DNS answer packets. @module */
import { getServers } from 'node:dns'
import { isIP } from 'node:net'
import { randomInt } from 'node:crypto'
import { join } from 'node:path'
import * as packet from 'dns-packet'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { canonicalDnsName, canonicalTargetHost } from './rules.ts'
import { exchangeDns, parseDnsServer } from './dns-transport.ts'
import { TargetProtectionError } from './errors.ts'
import { readLocalSource } from './local-source.ts'

/** Resolver inputs, fixed by the deployment before resolving a request. */
export interface TargetDnsOptions {
  /** Empty follows the current OS-configured DNS servers. */
  servers: readonly string[]
  /** Empty disables hosts-file lookup; an explicit path is read before DNS. */
  hostsFile: string
  queryTimeoutMs: number
  maxCnameDepth: number
  maxRecords: number
  maxHostsBytes: number
}

/** Verified names and addresses from one resolution; no unrelated answer records are included. */
export interface TargetDnsResolution {
  hostname: string
  names: readonly string[]
  addresses: readonly { address: string; family: 4 | 6 }[]
  source: 'literal' | 'localhost' | 'hosts' | 'dns'
}

/**
 * Select the platform's ordinary hosts file without changing OS configuration.
 * @returns The Windows or POSIX hosts-file path.
 */
export function systemHostsFile(): string {
  return process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts') : '/etc/hosts'
}

async function hosts(host: string, options: TargetDnsOptions, signal: AbortSignal): Promise<TargetDnsResolution | undefined> {
  if (options.hostsFile === '') return undefined
  let text: string
  try {
    const bytes = await readLocalSource(options.hostsFile, options.maxHostsBytes, signal)
    text = bytes.toString('utf8')
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
  const names = new Set([host])
  const addresses = new Map<string, { address: string; family: 4 | 6 }>()
  for (const line of text.split(/\r?\n/u)) {
    const fields = line.split('#')[0]?.trim().split(/\s+/u) ?? []
    const ip = fields[0]
    if (ip === undefined || !isIP(ip)) continue
    const aliases = fields.slice(1).map(canonicalDnsName)
    if (!aliases.includes(host)) continue
    const address = canonicalTargetHost(ip)
    for (const alias of aliases) names.add(alias)
    addresses.set(address, { address, family: isIP(address) === 4 ? 4 : 6 })
  }
  if (addresses.size === 0) return undefined
  if (addresses.size > options.maxRecords || names.size > options.maxRecords) throw new Error('Hosts entry exceeds the configured record limit.')
  return { hostname: host, names: [...names], addresses: [...addresses.values()], source: 'hosts' }
}

function validateReply(bytes: Buffer, id: number, host: string, type: 'A' | 'AAAA', maxRecords: number): packet.DecodedPacket {
  let response: packet.DecodedPacket
  try { response = packet.decode(bytes) }
  catch (error) { throw new TargetProtectionError('unavailable', 'DNS reply could not be decoded.', { cause: error }) }
  const question = response.questions?.[0]
  if (response.type !== 'response' || response.id !== id || response.flag_tc || response.questions?.length !== 1
    || question?.type !== type || question.class !== 'IN' || canonicalDnsName(question.name) !== host) {
    throw new TargetProtectionError('unavailable', 'DNS reply does not match the pending question.')
  }
  if ((response.flags ?? 0) & 15) throw new TargetProtectionError('unavailable', 'DNS resolver did not return a successful answer.')
  if ((response.answers?.length ?? 0) > maxRecords) throw new TargetProtectionError('unavailable', 'DNS answer exceeds the configured record limit.')
  return response
}

async function query(host: string, type: 'A' | 'AAAA', options: TargetDnsOptions, signal: AbortSignal): Promise<packet.DecodedPacket> {
  const servers = options.servers.length === 0 ? getServers() : options.servers
  if (servers.length === 0) throw new Error('No DNS resolver is configured.')
  const failures: unknown[] = []
  for (const value of servers) {
    signal.throwIfAborted()
    using timeout = deadline(signal, options.queryTimeoutMs, 'TARGET_DNS_TIMEOUT')
    const id = randomInt(65536)
    const request = packet.encode({ type: 'query', id, flags: packet.RECURSION_DESIRED, questions: [{ name: host, type, class: 'IN' }] })
    try { return validateReply(await exchangeDns(request, parseDnsServer(value), timeout.signal), id, host, type, options.maxRecords) }
    catch (error) {
      signal.throwIfAborted()
      if (error instanceof TargetProtectionError) throw error
      failures.push(error)
    }
  }
  throw new TargetProtectionError('unavailable', 'Configured DNS resolvers could not verify this destination.', { cause: new AggregateError(failures) })
}

async function family(host: string, type: 'A' | 'AAAA', options: TargetDnsOptions, signal: AbortSignal): Promise<TargetDnsResolution> {
  const names = [host]
  const seen = new Set<string>()
  let current = host
  for (;;) {
    const response = await query(current, type, options, signal)
    const answers = (response.answers ?? []).filter(answer => 'class' in answer && answer.class === 'IN')
    let advanced = false
    for (;;) {
      const relevant = answers.filter(answer => canonicalDnsName(answer.name) === current)
      const aliases = relevant.filter((answer): answer is packet.StringAnswer => answer.type === 'CNAME')
      const addressRecords = relevant.filter((answer): answer is packet.StringAnswer => answer.type === type)
      if (aliases.length > 1 || (aliases.length > 0 && addressRecords.length > 0)) throw new Error('Conflicting DNS alias and address records.')
      const alias = aliases[0]
      if (alias !== undefined) {
        if (seen.has(current) || names.length > options.maxCnameDepth) throw new Error('DNS alias chain is cyclic or too deep.')
        seen.add(current)
        current = canonicalDnsName(alias.data)
        if (seen.has(current)) throw new Error('DNS alias chain is cyclic.')
        names.push(current); advanced = true
        continue
      }
      if (addressRecords.length > 0) {
        const expected = type === 'A' ? 4 : 6
        const addresses = addressRecords.map((record) => {
          if (isIP(record.data) !== expected) throw new Error('DNS returned an invalid address record.')
          const address = canonicalTargetHost(record.data)
          return { address, family: isIP(address) === 4 ? 4 as const : 6 as const }
        })
        return { hostname: host, names, addresses, source: 'dns' }
      }
      if (!advanced) return { hostname: host, names, addresses: [], source: 'dns' }
      break
    }
  }
}

/**
 * Resolve a target with its names and pinned addresses from hosts data or complete DNS packets.
 * @param hostname - URL hostname; IP literals require no DNS traffic.
 * @param options - Explicit resolver limits and source selection.
 * @param signal - Complete resolution deadline and cancellation.
 * @returns Complete evidence for both address families; uncertainty rejects the operation.
 */
export async function resolveTargetDns(hostname: string, options: TargetDnsOptions, signal: AbortSignal): Promise<TargetDnsResolution> {
  signal.throwIfAborted()
  const literal = hostname.replace(/^\[([^\]]+)\]$/u, '$1')
  if (isIP(literal)) {
    const address = canonicalTargetHost(literal)
    return { hostname: address, names: [address], addresses: [{ address, family: isIP(address) === 4 ? 4 : 6 }], source: 'literal' }
  }
  const host = canonicalDnsName(hostname)
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return { hostname: host, names: [host], addresses: [{ address: '127.0.0.1', family: 4 }, { address: '::1', family: 6 }], source: 'localhost' }
  }
  const local = await hosts(host, options, signal)
  if (local !== undefined) return local
  const results = await Promise.allSettled([family(host, 'A', options, signal), family(host, 'AAAA', options, signal)])
  signal.throwIfAborted()
  const failures: unknown[] = []
  const names = new Set([host]), addresses = new Map<string, { address: string; family: 4 | 6 }>()
  for (const result of results) {
    if (result.status === 'rejected') { failures.push(result.reason); continue }
    for (const name of result.value.names) names.add(name)
    for (const address of result.value.addresses) addresses.set(address.address, address)
  }
  if (failures.length > 0 || addresses.size === 0 || addresses.size > options.maxRecords || names.size > options.maxRecords) {
    throw new TargetProtectionError('unavailable', 'DNS did not provide a complete bounded destination identity.', { cause: new AggregateError(failures) })
  }
  return { hostname: host, names: [...names], addresses: [...addresses.values()], source: 'dns' }
}
