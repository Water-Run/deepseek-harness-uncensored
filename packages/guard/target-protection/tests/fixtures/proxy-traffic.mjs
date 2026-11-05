/** Separate-process HTTP and CONNECT traffic through the issued conversation listener. */
import { request } from 'node:http'
import { connect } from 'node:net'

const proxy = new URL(process.env.HTTP_PROXY)
const [mode, target] = process.argv.slice(2)
if (mode === 'http') {
  const url = new URL(target)
  const result = await new Promise((accept, reject) => {
    const call = request({ host: proxy.hostname, port: Number(proxy.port), path: url.href,
      headers: { host: url.host, connection: 'close' } }, (response) => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.once('error', reject)
      response.once('end', () => accept({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    call.once('error', reject)
    call.end()
  })
  process.stdout.write(JSON.stringify(result))
} else if (mode === 'connect') {
  const result = await new Promise((accept, reject) => {
    const chunks = []
    const socket = connect(Number(proxy.port), proxy.hostname, () => {
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`
        + `GET / HTTP/1.1\r\nHost: ${target}\r\nConnection: close\r\n\r\n`)
    })
    socket.on('data', chunk => chunks.push(chunk))
    socket.once('error', reject)
    socket.once('close', () => accept(Buffer.concat(chunks).toString('utf8')))
  })
  process.stdout.write(JSON.stringify(result))
} else {
  throw new Error('Unsupported traffic fixture mode')
}
