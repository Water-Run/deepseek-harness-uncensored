/** Loopback HTTPS balance response for the installed desktop upgrade fixture. */
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:https'

const [certificate, keyFile, ...extra] = process.argv.slice(2)
if (!certificate || !keyFile || extra.length) throw new Error('Usage: node balance-history-endpoint.mjs <certificate.pem> <private-key.pem>')

const server = createServer({ cert: await readFile(certificate), key: await readFile(keyFile) }, (request, response) => {
  if (request.method !== 'GET' || request.url !== '/user/balance'
    || request.headers.authorization !== 'Bearer offline-balance-fixture') {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
    balance_infos: [{ currency: 'CNY', topped_up_balance: '987.654321', granted_balance: '0' }],
  }))
})
server.listen(19343, '127.0.0.1', () => { console.log('Balance fixture listening on https://127.0.0.1:19343') })
