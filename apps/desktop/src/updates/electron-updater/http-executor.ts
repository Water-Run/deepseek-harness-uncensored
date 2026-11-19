/** Electron-native inactivity deadlines and cancellation for updater requests. */
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import { CancellationError, configureRequestOptions, configureRequestUrl, DigestTransform, ProgressCallbackTransform,
  safeGetHeader, type DownloadOptions } from 'builder-util-runtime'
import type { ClientRequest, IncomingMessage } from 'electron'
import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import type { RequestOptions } from 'node:http'
import type { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

type ApiRequestToken = Parameters<ElectronHttpExecutor['doApiRequest']>[1]
type ApiRequestProcessor = Parameters<ElectronHttpExecutor['doApiRequest']>[2]
type DownloadCall = Parameters<ElectronHttpExecutor['doDownload']>[1]
type ResponseCallback = Parameters<ElectronHttpExecutor['createRequest']>[1]

/** Retains electron-updater transport and proxy handling while bounding silent connections. */
export class DesktopUpdateHttpExecutor extends ElectronHttpExecutor {
  private readonly redirects = new WeakMap<RequestOptions, number>()
  private readonly cancellationOwners = new WeakMap<ApiRequestToken, ApiRequestToken>()
  private readonly downloadCancellations = new WeakMap<RequestOptions, DownloadCall['onCancel']>()
  private readonly downloadScope = new AsyncLocalStorage<ApiRequestToken | undefined>()
  private readonly rangeOwners = new WeakMap<ClientRequest, ApiRequestToken>()

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

  /**
   * Associate direct differential requests with the pending installer download.
   * @param token - Cancellation token for the selected installer.
   * @param download - Library operation that owns reconstruction and closing its files.
   * @returns The library operation, including its file cleanup.
   */
  runDownload<T>(token: ApiRequestToken | undefined, download: () => Promise<T>): Promise<T> {
    return this.downloadScope.run(token, download)
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

  protected override doDownload(options: RequestOptions, call: DownloadCall, redirectCount: number): void {
    if (call.options.cancellationToken.cancelled) return
    this.downloadCancellations.set(options, call.onCancel)
    try { super.doDownload(options, call, redirectCount) }
    finally { this.downloadCancellations.delete(options) }
  }

  override createRequest(options: RequestOptions, callback: ResponseCallback): ClientRequest {
    const request = super.createRequest(options, callback)
    const cancelDownload = this.downloadCancellations.get(options)
    const rangeOwner = this.downloadScope.getStore()
    const { headers } = options
    // The pinned download promise exposes a single cancellation callback for the current request.
    if (cancelDownload !== undefined) cancelDownload(() => { request.abort() })
    else if (rangeOwner !== undefined && headers !== undefined && ('range' in headers || 'Range' in headers)) {
      this.rangeOwners.set(request, rangeOwner)
    }
    return request
  }

  override async download(url: URL, destination: string, options: DownloadOptions): Promise<string> {
    const request = { headers: options.headers ?? undefined, redirect: 'manual' }
    configureRequestUrl(url, request)
    configureRequestOptions(request)
    const transfer = new AbortController()
    let writing: Promise<void> | undefined
    try {
      return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
        this.doDownload(request, {
          destination, options, onCancel,
          callback: (error) => { if (error == null) resolve(destination); else reject(error) },
          responseHandler: (response, complete) => {
            const checksum: unknown = safeGetHeader(response, 'x-checksum-sha2')
            if (checksum != null && options.sha2 != null && checksum !== options.sha2) {
              response.resume()
              complete(new Error('Desktop update X-Checksum-Sha2 header mismatch'))
              return
            }
            const length = Number(response.headers['content-length'])
            const transforms: Transform[] = []
            if (options.onProgress !== undefined && Number.isSafeInteger(length) && length > 0) {
              transforms.push(new ProgressCallbackTransform(length, options.cancellationToken, options.onProgress))
            }
            if (options.sha512 != null) {
              transforms.push(new DigestTransform(options.sha512, 'sha512', /^[0-9a-f]{128}$/iu.test(options.sha512) ? 'hex' : 'base64'))
            } else if (options.sha2 != null) {
              transforms.push(new DigestTransform(options.sha2, 'sha256', 'hex'))
            }
            writing = pipeline([response, ...transforms, fs.createWriteStream(destination)], { signal: transfer.signal })
              .then(() => { complete(null) }, (error: unknown) => { complete(error instanceof Error ? error : new Error(String(error))) })
          },
        }, 0)
      })
    } finally {
      transfer.abort()
      // Cancellation rejects the library promise before the pipeline has released its destination.
      await writing
    }
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
    const rangeOwner = this.rangeOwners.get(request)
    let response: IncomingMessage | undefined
    let timer: ReturnType<typeof setTimeout>
    const stop = (): void => {
      clearTimeout(timer)
      request.off('response', onResponse)
      request.off('abort', stop)
      request.off('redirect', redirect)
      request.off('error', stop)
      response?.off('data', refresh)
      response?.off('end', stop)
      response?.off('error', stop)
      rangeOwner?.removeListener('cancel', abortRange)
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
    const redirect = (): void => {
      // Direct Range requests can follow redirects on the same ClientRequest.
      if (rangeOwner === undefined) stop()
      else refresh()
    }
    const abortRange = (): void => {
      stop()
      reject(new CancellationError())
      request.abort()
    }
    request.once('response', onResponse)
    // Electron 44 can emit writable close after finish, before response headers arrive.
    request.once('abort', stop)
    request.on('redirect', redirect)
    request.once('error', stop)
    refresh()
    if (rangeOwner?.cancelled) abortRange()
    else rangeOwner?.once('cancel', abortRange)
  }
}
