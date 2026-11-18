/** Electron-native inactivity deadlines for updater checks, full downloads, and blockmap requests. */
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import type { ClientRequest, IncomingMessage } from 'electron'
import type { RequestOptions } from 'node:http'

type ApiRequestToken = Parameters<ElectronHttpExecutor['doApiRequest']>[1]
type ApiRequestProcessor = Parameters<ElectronHttpExecutor['doApiRequest']>[2]

/** Retains electron-updater transport and proxy handling while bounding silent connections. */
export class DesktopUpdateHttpExecutor extends ElectronHttpExecutor {
  private readonly redirects = new WeakMap<RequestOptions, number>()
  private readonly cancellationOwners = new WeakMap<ApiRequestToken, ApiRequestToken>()

  /**
   * @param idleTimeoutMs - Maximum silence before headers or between response chunks, not a total download deadline.
   * @param proxyLogin - Existing updater login event forwarding.
   */
  constructor(private readonly idleTimeoutMs: number, proxyLogin?: ConstructorParameters<typeof ElectronHttpExecutor>[0]) {
    super(proxyLogin)
    if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 2_147_483_647) {
      throw new Error('desktop update: HTTP idle timeout must be an integer from 1000 through 2147483647')
    }
  }

  override async doApiRequest(options: RequestOptions, token: ApiRequestToken, requestProcessor: ApiRequestProcessor,
    redirectCount?: number): Promise<string> {
    // The pinned executor recurses with the previous hop's token after aborting its request.
    const previousOwner = this.cancellationOwners.get(token)
    if (previousOwner !== undefined) token.dispose()
    const owner = previousOwner ?? token
    const Token = owner.constructor as new(parent: ApiRequestToken) => ApiRequestToken
    const hopToken = new Token(owner)
    this.cancellationOwners.set(hopToken, owner)
    try { return await super.doApiRequest(options, hopToken, requestProcessor, redirectCount) }
    finally { hopToken.dispose() }
  }

  protected override addRedirectHandlers(request: ClientRequest, options: RequestOptions, reject: (error: Error) => void,
    redirectCount: number, handler: (options: RequestOptions) => void): void {
    // The pinned updater recreates the request without advancing the argument for the new hop.
    const nextCount = (this.redirects.get(options) ?? redirectCount) + 1
    super.addRedirectHandlers(request, options, reject, nextCount, (redirected) => {
      this.redirects.set(redirected, nextCount)
      handler(redirected)
    })
  }

  override addErrorAndTimeoutHandlers(request: ClientRequest, reject: (error: Error) => void): void {
    // The upstream socket timer is for Node HTTP; Electron ClientRequest has response/close events instead.
    super.addErrorAndTimeoutHandlers(request, reject, this.idleTimeoutMs)
    let response: IncomingMessage | undefined
    let timer: ReturnType<typeof setTimeout>
    const stop = (): void => {
      clearTimeout(timer)
      request.off('response', onResponse)
      request.off('abort', stop)
      request.off('redirect', stop)
      request.off('error', stop)
      response?.off('data', refresh)
      response?.off('end', stop)
      response?.off('error', stop)
    }
    const refresh = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        stop()
        reject(Object.assign(new Error('Desktop update connection timed out'), { code: 'ETIMEDOUT' }))
        request.abort()
      }, this.idleTimeoutMs)
    }
    const onResponse = (incoming: IncomingMessage): void => {
      response = incoming
      response.on('data', refresh)
      response.once('end', stop)
      response.once('error', stop)
      refresh()
    }
    request.once('response', onResponse)
    // Electron 44 can emit writable close after finish, before response headers arrive.
    request.once('abort', stop)
    request.once('redirect', stop)
    request.once('error', stop)
    refresh()
  }
}
