/** One owned DNS exchange against an explicitly configured resolver. @module */
import { createSocket } from 'node:dgram'
import { createConnection, isIP } from 'node:net'
import * as packet from 'dns-packet'

/** Literal resolver endpoint; DNS transport never resolves its own server name. */
export interface DnsServer {
  host: string
  port: number
}

/**
 * Parse Node's configured DNS-server notation.
 * @param value - IP literal, IPv4:port, or [IPv6]:port.
 * @returns Validated literal endpoint.
 */
export function parseDnsServer(value: string): DnsServer {
  if (isIP(value)) return { host: value, port: 53 }
  const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/u.exec(value)
  const host = match?.[1] ?? match?.[2]
  const port = Number(match?.[3])
  if (host === undefined || !isIP(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('A DNS server must be a literal IP with an optional port.')
  }
  return { host, port }
}

function cancellation(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  return reason instanceof Error ? reason : new Error('DNS exchange cancelled.', { cause: reason })
}

async function udp(query: Buffer, server: DnsServer, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    // proxy-exempt: DNS uses the operator's configured resolver, independently of HTTP proxy routing.
    const socket = createSocket(isIP(server.host) === 6 ? 'udp6' : 'udp4')
    let settled = false
    const finish = (error?: Error, response?: Buffer): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      const complete = (): void => {
        if (error !== undefined) reject(error)
        else if (response !== undefined) resolve(response)
        else reject(new Error('DNS exchange ended without a response.'))
      }
      try { socket.close(complete) }
      catch (closeError) {
        if (typeof closeError === 'object' && closeError !== null && 'code' in closeError && closeError.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING') complete()
        else reject(closeError instanceof Error ? closeError : new Error('DNS socket closure failed.', { cause: closeError }))
      }
    }
    const abort = (): void => { finish(cancellation(signal)) }
    signal.addEventListener('abort', abort, { once: true })
    socket.on('error', (error) => { finish(error) })
    socket.on('message', (bytes) => {
      if (bytes.length < 12 || bytes.readUInt16BE(0) !== query.readUInt16BE(0)) return
      finish(undefined, bytes)
    })
    socket.connect(server.port, server.host, () => {
      if (!settled) socket.send(query, (error) => { if (error) finish(error) })
    })
  })
}

async function tcp(query: Buffer, server: DnsServer, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    // proxy-exempt: TCP fallback for the same configured DNS resolver after a truncated UDP reply.
    const socket = createConnection({ host: server.host, port: server.port })
    let settled = false, closed = false
    let failure: Error | undefined, result: Buffer | undefined
    let data = Buffer.alloc(0)
    const complete = (): void => {
      if (failure !== undefined) reject(failure)
      else if (result !== undefined) resolve(result)
      else reject(new Error('DNS TCP connection closed before a full reply.'))
    }
    const finish = (error?: Error, bytes?: Buffer): void => {
      if (settled) return
      settled = true; failure = error; result = bytes
      signal.removeEventListener('abort', abort)
      socket.destroy()
      if (closed) complete()
    }
    const abort = (): void => { finish(cancellation(signal)) }
    signal.addEventListener('abort', abort, { once: true })
    socket.on('error', (error) => { finish(error) })
    socket.on('close', () => { closed = true; if (!settled) finish(new Error('DNS TCP connection closed early.')); else complete() })
    socket.on('connect', () => {
      if (settled) return
      const prefix = Buffer.alloc(2); prefix.writeUInt16BE(query.length)
      socket.write(Buffer.concat([prefix, query]))
    })
    socket.on('data', (chunk: Buffer) => {
      if (settled) return
      // DNS-over-TCP has a 16-bit frame length; retain no bytes beyond one frame.
      if (data.length + chunk.length > 65537) { finish(new Error('DNS TCP reply exceeded one frame.')); return }
      data = Buffer.concat([data, chunk])
      if (data.length < 2) return
      const length = data.readUInt16BE(0)
      if (length < 12) { finish(new Error('DNS TCP reply is too short.')); return }
      if (data.length >= length + 2) finish(undefined, data.subarray(2, length + 2))
    })
  })
}

/**
 * Read one matching UDP reply, retrying over TCP only for truncation.
 * @param query - Encoded query with its randomized transaction identity.
 * @param server - Operator-selected resolver endpoint.
 * @param signal - Timeout and cancellation; every socket closes before settlement.
 * @returns Full encoded DNS response for validation by the resolver.
 */
export async function exchangeDns(query: Buffer, server: DnsServer, signal: AbortSignal): Promise<Buffer> {
  const response = await udp(query, server, signal)
  signal.throwIfAborted()
  return response.readUInt16BE(2) & packet.TRUNCATED_RESPONSE ? tcp(query, server, signal) : response
}
