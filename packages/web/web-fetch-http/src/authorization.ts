/** Deployment-owned decisions at the HTTP provider's resolution and connection points. @module */
import type { PublicAddress } from './network.ts'

/** Credentials, query parameters and response data are absent from this target identity. */
export interface HttpFetchAuthority {
  /** Normalized HTTP(S) origin, preserving the hostname used for TLS and Host. */
  readonly origin: string
  /** URL hostname; IPv6 literals retain URL brackets. */
  readonly hostname: string
  /** Effective destination port, including protocol defaults. */
  readonly port: number
}

/** The exact destination facts available at one execution checkpoint. */
export type HttpFetchDestination = HttpFetchAuthority & (
  | { readonly phase: 'before-resolution'; readonly route: 'direct' | 'proxy' }
  | { readonly phase: 'before-connect'; readonly route: 'direct'; readonly addresses: readonly PublicAddress[] }
  | { readonly phase: 'before-connect'; readonly route: 'proxy'; readonly addresses: null }
)

/** A policy listener can refuse a hop; it cannot override another listener's refusal. */
export interface HttpFetchRejection {
  /** Actionable explanation without credentials or request query data. */
  readonly reason: string
}

/**
 * Check one hop before resolution and immediately before transport admission.
 * Reject on denial or unavailable policy; normal completion permits this checkpoint only.
 * @param destination - Logical authority and the addresses available at this checkpoint.
 * @param signal - Deadline and cancellation for the pending request.
 * @returns Completion of this checkpoint, or rejection before transport admission.
 */
export type HttpFetchAuthorizer = (destination: HttpFetchDestination, signal: AbortSignal) => Promise<void>

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Veto one HTTP hop before its DNS lookup or connection. No listener means no deployment policy.
     * Proxy destinations have no locally verified address set; policies must not treat null as an empty destination list.
     * @param destination - Immutable logical authority and connection-address facts.
     * @param signal - Request deadline and cancellation.
     * @mode serial
     */
    'web-fetch/authorize'(destination: HttpFetchDestination, signal: AbortSignal): HttpFetchRejection | undefined | Promise<HttpFetchRejection | undefined>
  }
}
