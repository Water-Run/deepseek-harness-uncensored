/** Controlled Remote answers for desktop browser routing. */
import { vi } from 'vitest'
import type { SecurityProxyState } from '@deepseek-ai/dsh-api-remotes/client'
import type { BrowserProxyPort } from '../src/client/electron/proxy.ts'

/** @param enabled - saved proxy switch. @returns a credential-free fixture state. */
export function proxyState(enabled: boolean): SecurityProxyState {
  return { settings: { enabled, protocol: 'http', host: 'proxy.test', port: 8888, authEnabled: false, username: '',
    hasPassword: false, warnWhenDisabled: false, capturePaused: false, maxFlows: 20, maxBodyBytes: 2048, retentionMinutes: 10 },
  status: enabled ? 'ready' : 'off', failure: null, detail: null, checkedAt: null, latencyMs: null,
  capture: { paused: false, total: 0, retained: 0, bytes: 0 }, listeners: 0, coverage: [] }
}

/** @param enabled - initial saved switch. @returns controllable Host reads. */
export function proxyFixture(enabled = true) {
  return {
    get: vi.fn<BrowserProxyPort['get']>().mockResolvedValue({ ok: true, value: proxyState(enabled) }),
    browserEnvironment: vi.fn<BrowserProxyPort['browserEnvironment']>().mockResolvedValue({ ok: true, value: 'http://127.0.0.1:49152' }),
  }
}
