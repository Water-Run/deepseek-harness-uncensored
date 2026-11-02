/** Owned listener workload for native-network-probe; never accepts executable input. @module */
import { createServer, connect } from 'node:net'

const servers = [], sockets = new Set()
async function attempt(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    let result = 'timeout'
    socket.on('connect', () => { result = 'connected'; socket.end() })
    socket.on('data', () => {})
    socket.on('error', (error) => { result = error.code; socket.destroy() })
    socket.setTimeout(750, () => { socket.destroy() })
    socket.on('close', () => { resolve(result) })
  })
}

async function serve(host) {
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
    socket.on('error', () => { socket.destroy() })
    socket.end('owned listener')
  })
  servers.push(server)
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host, port: 0 }, resolve) })
  } catch (error) { return { host, error: error.code } }
  const port = server.address().port
  return { host, port, self: await attempt(host === '0.0.0.0' ? '127.0.0.1' : '::1', port) }
}

try {
  const ready = [await serve('0.0.0.0'), await serve('::')]
  const egress = await attempt('127.0.0.1', Number(process.argv[2]))
  console.log(JSON.stringify({ ready, egress }))
  process.stdin.once('data', () => {
    for (const socket of sockets) socket.destroy()
    for (const server of servers) server.close()
    process.stdin.destroy()
  })
} catch (error) {
  for (const socket of sockets) socket.destroy()
  for (const server of servers) server.close()
  console.error(error)
  process.exitCode = 1
}
