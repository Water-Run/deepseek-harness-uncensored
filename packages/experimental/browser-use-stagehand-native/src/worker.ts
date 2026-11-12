/** Isolated browser runtime configures native inference in Stagehand's extension. */

import { parentPort, workerData } from 'node:worker_threads'
import { z } from 'zod'
import { browserInputs, openNativeBrowser, stagehandModelSchema } from './native.ts'
import { answer } from './worker-rpc.ts'
import { openWithOwnedSockets } from './socket-lifetime.ts'

const port = parentPort
if (port === null) throw new Error('Stagehand attachment requires a Worker parent')
const { extensionId, cdpEndpoint, executablePath, proxyControlHost, ...config } = z.object({
  model: stagehandModelSchema,
  mode: z.enum(['launch', 'attach']),
  cdpEndpoint: z.string().optional(),
  executablePath: z.string().optional(),
  extensionId: z.string().optional(),
  proxyControlHost: z.string().regex(/^dshu-[0-9a-f-]{36}\.localhost$/u).optional(),
  headless: z.boolean(),
  operationTimeoutMs: z.number().int().positive(),
  shutdownGraceMs: z.number().int().positive(),
}).parse(workerData)
const methodSchema = z.enum(Object.keys(browserInputs) as [keyof typeof browserInputs, ...Array<keyof typeof browserInputs>])
let rewrite: { from: string; to: string } | undefined
if (proxyControlHost !== undefined) {
  const address = z.string().parse(cdpEndpoint)
  const endpoint = new URL(address)
  if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1') throw new Error('Owned proxy control requires a loopback CDP socket')
  endpoint.hostname = proxyControlHost
  rewrite = { from: endpoint.href, to: address }
}
const opening = openWithOwnedSockets(() => openNativeBrowser(
  {
    ...config,
    ...cdpEndpoint === undefined ? {} : { cdpEndpoint },
    ...executablePath === undefined ? {} : { executablePath },
    ...extensionId === undefined ? {} : { extensionId },
    ...proxyControlHost === undefined ? {} : { proxyControlHost },
  },
), rewrite)
// Initialization failure stays observable through the host's ready request.
void opening.catch((error: unknown) => { void error })
port.on('message', (raw: unknown) => {
  void answer(raw, async (method, args) => {
    const native = await opening
    if (method === 'ready') return
    if (method === 'close') return native.close()
    return native.execute(methodSchema.parse(method), args)
  }).catch((error: unknown) => {
    console.error('Stagehand Worker protocol failed:', error)
    process.exit(1)
  })
})
