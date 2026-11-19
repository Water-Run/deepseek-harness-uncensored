/** Loopback-only update feeds and deterministic transport failures for Electron qualification. */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { gzipSync } from 'node:zlib'
import { dump } from 'js-yaml'

/**
 * Allocate a private listener with request barriers and no remote publication.
 * @returns {Promise<object>} Feed URL, scenario controls, observations, and awaited disposal.
 */
export async function createUpdateServer() {
  const payload = Buffer.alloc(256 * 1024, 0x5a)
  const blockSize = payload.length / 4
  for (let index = 0; index < 4; index++) payload.fill(0x5a + index, index * blockSize, (index + 1) * blockSize)
  const previousPayload = Buffer.from(payload)
  previousPayload.fill(0x31, blockSize, 2 * blockSize)
  const blockmap = bytes => gzipSync(JSON.stringify({ version: '2', files: [{
    name: 'payload', offset: 0, sizes: Array(4).fill(blockSize),
    checksums: Array.from({ length: 4 }, (_, index) =>
      createHash('sha256').update(bytes.subarray(index * blockSize, (index + 1) * blockSize)).digest('hex')),
  }] }))
  const previousBlockmap = blockmap(previousPayload)
  const currentBlockmap = blockmap(payload)
  const sha512 = createHash('sha512').update(payload).digest('base64')
  const requests = []
  const failures = []
  const ranges = []
  let mode = 'healthy'
  let version = '1.0.1-nightly.1'
  let policyMode = 'clear'
  let gate = Promise.withResolvers()
  let arrived = Promise.withResolvers()
  let origin
  const server = createServer((request, response) => {
    const url = new URL(request.url, origin)
    const path = url.pathname
    requests.push(path)
    const selectedMode = mode
    const differential = selectedMode.startsWith('range-')
    const payloadPath = differential ? `/payload-${version}.exe` : '/payload.exe'
    const selectedGate = gate
    response.setHeader('Cache-Control', 'no-store')
    void (async () => {
      if (path === '/api/v0/check_client_update') {
        response.setHeader('Content-Type', 'application/json')
        if (policyMode === 'stall') return
        if (policyMode === 'failure') { response.writeHead(503).end('{"code":500}'); return }
        response.end(JSON.stringify(policyMode === 'force' ? {
          code: 40005, data: { show_content: { title: '需要更新', detail: '现有任务继续运行，请更新后继续操作。' },
            desktop_app_link: 'https://downloads.example.com/desktop' },
        } : { code: 0, data: { biz_code: 0, biz_data: null } }))
        return
      }
      const redirectFixture = (path === '/nightly.yml' && ['feed-redirect-chain', 'feed-redirect-hold'].includes(selectedMode))
        || (path === '/payload.exe' && selectedMode === 'download-redirect-chain')
      if (redirectFixture) {
        const hop = Number(url.searchParams.get('hop') ?? 0)
        if (hop < (selectedMode === 'feed-redirect-hold' ? 2 : 11)) {
          url.searchParams.set('hop', String(hop + 1))
          response.writeHead(302, { Location: url.href }).end()
          return
        }
      }
      if (path === '/nightly.yml' || path === '/latest.yml') {
        if (selectedMode === 'feed-stall') return
        if (selectedMode === 'feed-404') { response.writeHead(404).end(); return }
        if (selectedMode === 'feed-408') { response.writeHead(408).end(); return }
        if (selectedMode === 'invalid-yaml') { response.end('files: ['); return }
        if (selectedMode === 'hold-check' || selectedMode === 'feed-redirect-hold') {
          arrived.resolve()
          await selectedGate.promise
          if (response.destroyed) return
        }
        response.setHeader('Content-Type', 'application/yaml')
        response.end(dump({ version, files: [{ url: origin + payloadPath, size: payload.length, sha512 }],
          path: payloadPath.slice(1), sha512, releaseDate: '2026-09-10T00:00:00.000Z' }))
        return
      }
      if (differential && (path === '/payload-1.0.0.exe.blockmap' || path === payloadPath + '.blockmap')) {
        response.end(path === payloadPath + '.blockmap' ? currentBlockmap : previousBlockmap)
        return
      }
      if (path !== payloadPath || selectedMode === 'download-404') { response.writeHead(404).end(); return }
      if (differential && request.headers.range) {
        const match = /^bytes=(\d+)-(\d+)$/u.exec(request.headers.range)
        if (!match || Number(match[1]) > Number(match[2]) || Number(match[2]) >= payload.length) { response.writeHead(416).end(); return }
        const start = Number(match[1]), end = Number(match[2])
        const bytes = payload.subarray(start, end + 1)
        ranges.push(request.headers.range)
        response.writeHead(206, { 'Content-Length': bytes.length, 'Content-Range': `bytes ${start}-${end}/${payload.length}` })
        if (selectedMode === 'range-hold') {
          response.write(bytes.subarray(0, 1024))
          arrived.resolve()
          await selectedGate.promise
          if (!response.destroyed) response.end(bytes.subarray(1024))
        } else response.end(bytes)
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length })
      if (selectedMode === 'download-stall') { response.write(payload.subarray(0, 1024)); return }
      if (selectedMode === 'corrupt') { response.end(Buffer.alloc(payload.length, 0x21)); return }
      if (selectedMode === 'disconnect') {
        response.write(payload.subarray(0, 1024), () => response.destroy())
        return
      }
      if (selectedMode === 'hold-download') {
        response.write(payload.subarray(0, 1024))
        arrived.resolve()
        await selectedGate.promise
        if (!response.destroyed) response.end(payload.subarray(1024))
        return
      }
      response.end(payload)
    })().catch(error => { failures.push(String(error)); response.destroy() })
  })
  const listening = once(server, 'listening')
  server.listen(0, '127.0.0.1')
  await listening
  origin = `http://127.0.0.1:${server.address().port}`
  return {
    url: `${origin}/`, payload, previousPayload, requests, ranges, failures,
    policy(next) { policyMode = next },
    select(nextMode, nextVersion = '1.0.1-nightly.1') {
      gate.resolve()
      gate = Promise.withResolvers()
      arrived = Promise.withResolvers()
      mode = nextMode
      version = nextVersion
    },
    arrived: () => arrived.promise,
    release: () => gate.resolve(),
    async close() {
      gate.resolve()
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      server.closeAllConnections()
      await closed
    },
  }
}
