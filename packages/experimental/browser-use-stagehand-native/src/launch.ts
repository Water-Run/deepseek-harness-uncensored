/** Own Chromium before CDP or Stagehand initialization can wait or fail. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Browser, ChromeReleaseChannel, CDP_WEBSOCKET_ENDPOINT_REGEX, computeSystemExecutablePath, launch } from '@puppeteer/browsers'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { BrowserResourceCleanupError } from '@deepseek-ai/dsh-experimental-browser-use-runtime'
import { writeChromiumProfileTrust, type BrowserProxyRoute } from '@deepseek-ai/dsh-experimental-browser-use-runtime/proxy'
import type { NativeBrowserConfig } from './native.ts'

/** Chromium process and profile owned independently of the Stagehand Worker. */
export interface OwnedChromium {
  /** CDP endpoint reported by this exact process. */
  endpoint: string
  /** Private Chromium-only hostname exempted from the page proxy for this browser's CDP connection. */
  proxyControlHost?: string
  /** Kill the owned process tree, await child close, and remove its profile. */
  close(): Promise<void>
}

/**
 * Launch Chromium with scrubbed environment and OS-allocated debugging port.
 * @param config - executable, window visibility, and startup deadline.
 * @param signal - cancellation before the caller receives browser ownership.
 * @param proxy - Optional session-owned loopback proxy and its public trust material.
 * @returns the owned browser after its debugging endpoint is ready.
 */
export async function launchChromium(
  config: NativeBrowserConfig, signal: AbortSignal, proxy?: BrowserProxyRoute,
): Promise<OwnedChromium> {
  signal.throwIfAborted()
  const executablePath = config.executablePath
    ?? computeSystemExecutablePath({ browser: Browser.CHROME, channel: ChromeReleaseChannel.STABLE })
  const proxyServer = proxy?.server
  const profile = await mkdtemp(join(tmpdir(), 'dsh-stagehand-chrome-'))
  const proxyControlHost = proxyServer === undefined ? undefined : `dshu-${randomUUID()}.localhost`
  let browser: ReturnType<typeof launch> | undefined
  let closed: Promise<void> | undefined
  let closing: Promise<void> | undefined
  const close = () => closing ??= (async () => {
    browser?.kill()
    await closed
    await rm(profile, { recursive: true, force: true })
  })()
  const abort = () => { void close().catch(() => {}) }
  try {
    if (proxy?.certificate !== undefined) await writeChromiumProfileTrust(profile, proxy.certificate)
    signal.throwIfAborted()
    browser = launch({
      executablePath,
      args: [
        '--remote-debugging-port=0', '--enable-unsafe-extension-debugging', '--remote-allow-origins=*',
        '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
        ...config.headless ? ['--headless=new'] : [],
        ...proxyServer === undefined ? [] : [
          `--proxy-server=${proxyServer}`, `--proxy-bypass-list=<-loopback>;${proxyControlHost}`,
          `--host-resolver-rules=MAP ${proxyControlHost} 127.0.0.1`,
        ],
        'about:blank',
      ],
      env: scrubbedParentEnv(), handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    })
    // Failed spawn emits error + close without exit; Process.hasClosed waits only for exit.
    const child = browser.nodeProcess
    closed = new Promise<void>((resolve) => { child.once('close', () => { resolve() }) })
    signal.addEventListener('abort', abort, { once: true })
    const endpoint = await browser.waitForLineOutput(CDP_WEBSOCKET_ENDPOINT_REGEX, config.operationTimeoutMs)
    signal.throwIfAborted()
    return { endpoint, close, ...proxyControlHost === undefined ? {} : { proxyControlHost } }
  } catch (error) {
    try { await close() }
    catch (cleanupError) {
      throw new BrowserResourceCleanupError('Chromium launch rollback could not be confirmed. Inspect the browser process and restart the Host before reuse.',
        { cause: new AggregateError([error, cleanupError]) })
    }
    signal.throwIfAborted()
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
  }
}
