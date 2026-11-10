/** Authenticate inspected sidebar connections without changing Chromium's ordinary trust. */
import { randomUUID, X509Certificate } from 'node:crypto'
import { isIP } from 'node:net'
import type { DesktopBrowserProxy } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import type { Session } from 'electron'

const BROWSER_TRUST_METHOD = 'securityProxy/browserTrust'
const CERT_AUTHORITY_INVALID = -202
const CHROMIUM_DEFAULT = -3
const SERVER_AUTH = '1.3.6.1.5.5.7.3.1'

/**
 * Read the certificate over the shell's authenticated Host transport.
 * @param proxy - Validated conversation and endpoint from the reservation.
 * @param send - The shell's Host request forwarder.
 * @returns Public PEM for this route, or null for opaque CONNECT.
 */
export async function readBrowserProxyCertificate(
  proxy: DesktopBrowserProxy, send: (request: Request) => Promise<Response>,
): Promise<string | null> {
  const rpcId = randomUUID()
  const response = await send(new Request(`dsh-app://app/api/${BROWSER_TRUST_METHOD}`, {
    method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: BROWSER_TRUST_METHOD,
      payload: { args: { agentId: proxy.sessionId, server: proxy.server } } }),
  }))
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error('desktop browser: Host refused the proxy trust request')
  }
  const envelope: unknown = await response.json()
  if (typeof envelope !== 'object' || envelope === null || !('type' in envelope) || envelope.type !== 'server-response'
    || !('rpcId' in envelope) || envelope.rpcId !== rpcId || !('result' in envelope)
    || typeof envelope.result !== 'object' || envelope.result === null || !('ok' in envelope.result) || envelope.result.ok !== true
    || !('value' in envelope.result)) {
    throw new Error('desktop browser: the proxy route could not be confirmed. Reopen the page to use the current route.')
  }
  const value = envelope.result.value
  if (value !== null && (typeof value !== 'string' || value.length > 8192)) {
    throw new Error('desktop browser: Host returned invalid proxy trust material')
  }
  return value
}

function validAt(certificate: X509Certificate, now: number): boolean {
  return certificate.validFromDate.getTime() <= now && now < certificate.validToDate.getTime()
}

/**
 * Validate the single self-signed authority supplied by the local Host.
 * @param pem - Public certificate for one proxy listener.
 * @returns The live root used for partition identity and leaf verification.
 */
export function parseBrowserProxyCa(pem: string): X509Certificate {
  if (!/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/u.test(pem)) {
    throw new Error('desktop browser: Host returned invalid proxy trust material')
  }
  const root = new X509Certificate(pem)
  if (!root.ca || !root.checkIssued(root) || !root.verify(root.publicKey) || !validAt(root, Date.now())) {
    throw new Error('desktop browser: the proxy certificate is invalid or expired')
  }
  return root
}

/**
 * Accept the listener's exact server leaf only on its isolated guest partition.
 * @param partition - The Electron Session dedicated to this route.
 * @param root - Validated public CA of the current listener.
 */
export function installBrowserProxyTrust(partition: Pick<Session, 'setCertificateVerifyProc'>, root: X509Certificate): void {
  partition.setCertificateVerifyProc((request, callback) => {
    let result = CHROMIUM_DEFAULT
    const now = Date.now()
    if (request.errorCode === CERT_AUTHORITY_INVALID && validAt(root, now)) {
      try {
        const leaf = new X509Certificate(request.certificate.data)
        const hostname = request.hostname.replace(/^\[|\]$/gu, '')
        const identity = isIP(hostname) === 0 ? leaf.checkHost(hostname, { subject: 'never', wildcards: false }) : leaf.checkIP(hostname)
        if (!leaf.ca && validAt(leaf, now) && leaf.keyUsage?.includes(SERVER_AUTH) && identity !== undefined
          && leaf.checkIssued(root) && leaf.verify(root.publicKey)) result = 0
      } catch (_error) {
        callback(CHROMIUM_DEFAULT)
        return
      }
    }
    callback(result)
  })
}
