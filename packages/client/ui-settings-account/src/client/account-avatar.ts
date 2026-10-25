/** One account picture load shared by the sidebar and Settings for this plugin lifetime. */

/* A failed picture is retried on its own: the first attempt often races the
   network at launch, and only opening Settings used to recover it. The delays
   grow so a genuinely unreachable host stops costing requests. */
const RETRY_DELAYS_MS = [4_000, 12_000, 30_000, 60_000] as const

/** Browser image outcome for the latest profile picture URL. */
export interface AccountAvatarSnapshot {
  /** Profile picture whose browser load produced this state. */
  url: string
  /** Both account surfaces show the picture only after its shared load succeeds. */
  status: 'loading' | 'ready' | 'failed'
}

/** Owns the browser image and discards callbacks after URL replacement or plugin unload. */
export class AccountAvatarLoader {
  private snapshot: AccountAvatarSnapshot | undefined
  private image: HTMLImageElement | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private retries = 0
  private disposed = false

  /** @param publish - publishes picture changes through the account snapshot. */
  constructor(private readonly publish: (snapshot: AccountAvatarSnapshot | undefined) => void) {}

  /**
   * Load a changed URL once; an absent or empty URL clears the picture.
   * @param url - latest successful profile's picture, absent when no picture is available.
   */
  setUrl(url: string | null | undefined): void {
    if (this.disposed) return
    const source = url || undefined
    if (this.snapshot?.url === source) return
    this.retries = 0
    if (source === undefined) {
      this.detach()
      this.update(undefined)
    }
    else this.load(source)
  }

  /** Retry a failed picture now; successful and pending loads remain shared. */
  retry(): void {
    if (this.disposed || this.snapshot?.status !== 'failed') return
    this.retries = 0
    this.load(this.snapshot.url)
  }

  /**
   * Return both surfaces to fallback when a rendered picture fails.
   * @param snapshot - picture attempt rendered by the failing element; superseded attempts are ignored.
   */
  failed(snapshot: AccountAvatarSnapshot): void {
    if (this.disposed || this.snapshot !== snapshot || snapshot.status !== 'ready') return
    this.detach()
    this.update({ url: snapshot.url, status: 'failed' })
  }

  /** Release the picture without publishing; the owner publishes an empty avatar with the replacement account frame. */
  reset(): void {
    this.detach()
    this.snapshot = undefined
  }

  /** Release the browser image and prevent further loads or publications. */
  dispose(): void {
    this.disposed = true
    this.reset()
  }

  private load(url: string): void {
    this.detach()
    const image = new Image()
    this.image = image
    image.referrerPolicy = 'no-referrer'
    const settle = (status: 'ready' | 'failed'): void => {
      if (this.image !== image) return
      image.onload = null
      image.onerror = null
      this.update({ url, status })
      if (status === 'ready') this.retries = 0
      else this.scheduleRetry(url)
    }
    image.onload = () => { settle('ready') }
    image.onerror = () => { settle('failed') }
    this.update({ url, status: 'loading' })
    if (this.image === image) image.src = url
  }

  /** Queue the next bounded retry after a failed preload, unless one is already waiting. */
  private scheduleRetry(url: string): void {
    const delay = RETRY_DELAYS_MS[this.retries]
    if (delay === undefined || this.retryTimer !== undefined || this.disposed) return
    this.retries += 1
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (this.disposed || this.snapshot?.url !== url) return
      this.load(url)
    }, delay)
  }

  private update(snapshot: AccountAvatarSnapshot | undefined): void {
    this.snapshot = snapshot
    this.publish(snapshot)
  }

  private detach(): void {
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    }
    const image = this.image
    this.image = undefined
    if (image === undefined) return
    image.onload = null
    image.onerror = null
    image.removeAttribute('src')
  }
}
