/** Browser Fetch transport; native Undici dispatchers cannot open sockets in a Worker. */
import { notAvailableError, notImplementedFail } from '../notImplementedFail.ts'

/** Browser-native header collection. */
export const Headers = globalThis.Headers
/** Browser-native request, including streaming bodies. */
export const Request = globalThis.Request
/** Browser-native response, including streaming bodies. */
export const Response = globalThis.Response

/**
 * Fetch through the browser without accepting a custom socket dispatcher.
 * @param input - Browser Fetch resource.
 * @param init - Browser request options; a dispatcher is explicitly unsupported.
 * @returns Browser response, or a rejection before transport when a dispatcher was supplied.
 */
export async function fetch(input: RequestInfo | URL, init?: RequestInit & { dispatcher?: unknown }): Promise<Response> {
  if (init?.dispatcher !== undefined) throw notAvailableError('undici', 'fetch dispatcher')
  return await globalThis.fetch(input, init)
}

/** Refuse native connection-pool construction. */
export const Agent = notImplementedFail('undici', 'Agent')
/** Refuse native pooled connections. */
export const Pool = notImplementedFail('undici', 'Pool')
/** Refuse a proxy instead of silently using the browser's direct transport. */
export const ProxyAgent = notImplementedFail('undici', 'ProxyAgent')
/** Refuse wrapping a custom native dispatcher. */
export const Dispatcher1Wrapper = notImplementedFail('undici', 'Dispatcher1Wrapper')
/** Refuse reading a Node-specific global dispatcher. */
export const getGlobalDispatcher = notImplementedFail('undici', 'getGlobalDispatcher')
/** Refuse replacing the browser transport with a Node-specific global dispatcher. */
export const setGlobalDispatcher = notImplementedFail('undici', 'setGlobalDispatcher')
