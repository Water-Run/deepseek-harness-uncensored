/** HTTP authorization must finish before the owned origin or proxy receives a connection. @module */
import { createServer, type Server, type RequestListener } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { WebError } from '@deepseek-ai/dsh-web'
import WebRuntime from '@deepseek-ai/dsh-web'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'
import { afterEach, expect, it, vi } from 'vitest'
import * as HttpPlugin from '../src/index.ts'
import { HttpFetchProvider, type HttpFetchLimits } from '../src/provider.ts'
import type { HttpFetchAuthorizer, HttpFetchDestination } from '../src/authorization.ts'
import { publicHttpNetwork } from '../src/network.ts'

const limits: HttpFetchLimits = { maxResponseBytes: 10000, maxBodyChars: 10000, timeoutMs: 5000, maxRedirects: 5, userAgent: 'target-guard-test' }
const contexts: Context[] = []
const servers: Server[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })))
})

async function origin(handler: RequestListener = (_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' }); response.end('observed')
}) {
  const server = createServer(handler); servers.push(server)
  let connections = 0
  server.on('connection', () => { connections++ })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const port = (server.address() as AddressInfo).port
  return { port, url: `http://127.0.0.1:${String(port)}/`, connections: () => connections }
}

function provider(authorize: HttpFetchAuthorizer) {
  const resolve = vi.fn(async () => [{ address: '127.0.0.1', family: 4 as const }])
  return { fetcher: new HttpFetchProvider(limits, resolve, authorize), resolve }
}

it('enforces a deployment veto through the actual web service before touching the origin', async () => {
  const target = await origin()
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(WebRuntime)
  const observed: HttpFetchDestination[] = []
  ctx.on('web-fetch/authorize', (destination) => { observed.push(destination); return undefined })
  ctx.on('web-fetch/authorize', () => ({ reason: 'Production endpoint is fully protected.' }))
  await ctx.plugin(HttpPlugin, HttpPlugin.Config({}))
  await expect(ctx.web.fetch({ url: `${target.url}?secret=not-for-policy` })).rejects.toMatchObject({ code: 'WEB_TARGET_PROTECTED' })
  expect(target.connections()).toBe(0)
  expect(observed).toHaveLength(1)
  expect(observed[0]).toMatchObject({ phase: 'before-resolution', port: target.port, hostname: '127.0.0.1' })
  expect(JSON.stringify(observed)).not.toContain('secret')
})

it('retains normal retrieval when the deployment has no target policy', async () => {
  const target = await origin()
  const ctx = new Context(); contexts.push(ctx)
  const resolver = vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
  try {
    await ctx.plugin(WebRuntime)
    await ctx.plugin(HttpPlugin, HttpPlugin.Config({}))
    const result = await ctx.web.fetch({ url: target.url })
    expect(result.body.content).toBe('observed')
    expect(target.connections()).toBe(1)
  } finally { resolver.mockRestore() }
})

it('does not fall back to unguarded transport when a policy fails', async () => {
  const target = await origin()
  const { fetcher } = provider(async () => { throw new Error('Policy registry unavailable') })
  await expect(fetcher.fetch({ url: target.url })).rejects.toMatchObject({ code: 'WEB_PROVIDER_ERROR' })
  expect(target.connections()).toBe(0)
})

it('rejects a resolved alias before a socket opens', async () => {
  const target = await origin()
  const attempts: HttpFetchDestination[] = []
  const { fetcher, resolve } = provider(async (destination) => {
    attempts.push(destination)
    if (destination.phase === 'before-connect') throw new WebError('Resolved address is protected.', 'WEB_TARGET_PROTECTED')
  })
  await expect(fetcher.fetch({ url: `http://alias.test:${String(target.port)}/` })).rejects.toMatchObject({ code: 'WEB_TARGET_PROTECTED' })
  expect(resolve).toHaveBeenCalledOnce()
  expect(attempts[1]).toMatchObject({ route: 'direct', addresses: [{ address: '127.0.0.1', family: 4 }] })
  expect(target.connections()).toBe(0)
})

it('uses the checked address set on an allowed request and checks new policy at a redirect', async () => {
  let protectedNow = false
  let requests = 0
  const target = await origin((_request, response) => {
    requests++
    protectedNow = true
    response.writeHead(302, { location: '/next' }); response.end()
  })
  const phases: string[] = []
  const { fetcher } = provider(async (destination) => {
    phases.push(destination.phase)
    if (protectedNow) throw new WebError('Policy changed before redirected request.', 'WEB_TARGET_PROTECTED')
  })
  await expect(fetcher.fetch({ url: `http://alias.test:${String(target.port)}/` })).rejects.toMatchObject({ code: 'WEB_TARGET_PROTECTED' })
  expect(phases).toEqual(['before-resolution', 'before-connect', 'before-resolution'])
  expect(requests).toBe(1)
  expect(target.connections()).toBe(1)
})

it('does not connect after cancellation while authorization was pending', async () => {
  const target = await origin()
  const reached = Promise.withResolvers<boolean>()
  const release = Promise.withResolvers<boolean>()
  const abort = new AbortController()
  const { fetcher } = provider(async (destination) => {
    if (destination.phase !== 'before-connect') return
    reached.resolve(true); await release.promise
  })
  const result = fetcher.fetch({ url: target.url }, abort.signal)
  const rejected = expect(result).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  try { await reached.promise; abort.abort(new Error('cancelled')) }
  finally { release.resolve(true) }
  await rejected
  expect(target.connections()).toBe(0)
})

it('reports the original proxy destination as unresolved and can refuse before proxy contact', async () => {
  const proxy = await origin()
  const restore = await installProxyFromEnvironment({
    get: name => name === 'HTTP_PROXY' || name === 'HTTPS_PROXY' ? { value: proxy.url } : undefined,
  }, () => undefined)
  try {
    const attempts: HttpFetchDestination[] = []
    const { fetcher, resolve } = provider(async (destination) => {
      attempts.push(destination)
      if (destination.phase === 'before-connect') throw new WebError('Proxy target addresses are unverified.', 'WEB_TARGET_PROTECTED')
    })
    await expect(fetcher.fetch({ url: 'http://origin.test/data' })).rejects.toMatchObject({ code: 'WEB_TARGET_PROTECTED' })
    expect(attempts[1]).toMatchObject({ origin: 'http://origin.test', hostname: 'origin.test', route: 'proxy', addresses: null })
    expect(resolve).not.toHaveBeenCalled()
    expect(proxy.connections()).toBe(0)
  } finally { await restore() }
})
