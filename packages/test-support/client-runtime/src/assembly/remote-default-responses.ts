/**
 * Default Remote responses for client boot and empty conversation accounting.
 * Each row names its consumer. Feature actions need explicit scenario responses;
 * unscripted actions fail loudly. `$events` is built into `RemoteMock`.
 * @module @deepseek-ai/dsh-client-test-runtime/src/assembly/remote-default-responses
 */
import { ok, openStream, type RemoteTable } from '@deepseek-ai/dsh-remote-mock'

const spendLimits = { '15m': 5, '1h': 15, '5h': 50, '1d': 100, '7d': 500, '30d': 2000 }

/** Default read-only Remote responses; a spec loads them first and layers its own scenario on top. */
export const remoteDefaultResponses: RemoteTable = {
  unary: {
    // api-session-controller `sessions.handleConnected()` on `connection/reset`.
    'session/list': ok({ items: [] }),
    // Input prediction is enabled by default; ordinary assembly fixtures return no suggestion.
    'session/predict': (request: { revision: number }) => ok({ revision: request.revision, suggestion: '' }),
    // ui-workspace startup with no entries; first-use initialization is ineligible.
    'workspace/initializeDefault': ok(undefined),
    // ui-settings `mirror.ensure()` at apply and again on `connection/reset`.
    'settings/describe': ok({ writable: true, hasDocument: false, namespaces: [] }),
    // ui-model-selection `ModelDirectoryResolver` constructor.
    'session/modelCatalog': ok({
      default: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      routableProviders: [],
      groups: [],
      failures: [],
    }),
    // ui-agent-preset hero chip and header label on first mount.
    'agentPresets/list': ok({ presets: [] }),
    // ui-agent-preset mode switch permission, sensitive-confirmation preference,
    // and first-entry state; the composed client reads them when its mode page mounts.
    'agentPresets/switchPolicy': ok({ allowExistingSessionSwitch: false }),
    'agentPresets/sensitiveConfirmationPolicy': ok({ confirmations: true }),
    'agentPresets/securityEntryState': ok({
      required: false, preset: 'security', acknowledged: true,
      protection: { state: 'unavailable', revision: 0, capabilities: [] },
    }),
    // ui-agent-preset and the security proxy panel share the disabled upstream state.
    'securityProxy/get': ok({
      settings: {
        enabled: false, protocol: 'http', host: '', port: 8080, authEnabled: false, username: '', hasPassword: false,
        warnWhenDisabled: false, capturePaused: false, maxFlows: 500, maxBodyBytes: 65_536, retentionMinutes: 1440,
      },
      status: 'off', failure: null, detail: null, checkedAt: null, latencyMs: null, listeners: 0, coverage: [],
      capture: { paused: false, total: 0, retained: 0, bytes: 0 },
    }),
    'securityProxy/list': ok({ flows: [], capture: { paused: false, total: 0, retained: 0, bytes: 0 } }),
    // ui-settings-account and the conversation footer read independent, disabled limits.
    'spending/get': ok({
      preferences: {
        enabledPeriods: [], autoResume: false, limits: spendLimits,
      },
      windows: Object.entries(spendLimits).map(([period, limit]) => ({
        period, enabled: false, limit, spent: 0, reserved: 0, uncertain: 0, remaining: limit,
      })),
      paused: false, pending: 0, waiting: 0, pausedSessions: [], nextExpiry: null, updatedAt: 0,
    }),
    'spending/sessionUsage': ok({ total: 0, requests: 0, unpricedRequests: 0, points: [] }),
    // ui-agent-preset reads owner target preferences without enabling protection.
    'targetProtectionSettings/get': ok({ revision: 0, preferences: { mainlandEnabled: false, rules: [] } }),
    // cordis-client-runner `ClientCordisInspectRegistry.sync` at apply and on `connection/reset`.
    'dynamicCordisRunner/syncInspectManifest': ok(null),
    // ui-cordis inventory at apply and on `connection/reset`.
    'dynamicCordisRunner/inventory': ok([]),
    // ui-settings-web-search page `readCredential()` when the settings mirror first publishes.
    'credentials/describe': ok({}),
    // ui-settings-web-search page provider options at apply and on `connection/reset`.
    'web/listProviders': ok({ search: [], fetch: [] }),
    // ui-permission-presets `PermissionCatalogDirectory` on its first read for a connection generation.
    'permissionPresets/catalog': ok({ options: [] }),
    // ui-settings-account refreshes details after a stored-grant snapshot.
    'account/getProfile': ok(null),
    'account/getBalance': ok(null),
    // ui-settings-account bonus notice read and acknowledgement at signing in.
    'account/getNotifications': ok(null),
    'account/getNotificationContent': ok(null),
    'account/reportNotificationEvent': ok(true),
  },
  // Stream endpoints the roster opens later than boot; declared so a spec that forgets the script gets a stream miss.
  streams: [
    // api-session-controller `SessionEventStream.follow` when a Session opens.
    'session/follow',
  ],
  stream: {
    // api-session-controller client `apply`: the control stream's opening baseline, then open.
    'session/control': openStream([{ type: 'baseline', value: { projections: {} } }]),
    // ui-settings-account shares the account snapshot across settings and the sidebar menu.
    'account/watch': openStream([{ type: 'snapshot', state: { status: 'signed-out', attempt: null, links: { usageUrl: 'https://platform.deepseek.com/usage', topUpUrl: 'https://platform.deepseek.com/top_up' } } }]),
    // api-workspace-controller client `apply`: the follow stream's opening baseline, then open.
    'workspace/follow': openStream([{ type: 'baseline', value: { items: [], archivedSessionIds: [], pinnedSessionIds: [] } }]),
    // api-remote-access client `mountAccess`: the owner's access snapshot, then open.
    'remoteAccess/follow': openStream([{ type: 'baseline', owner: true }]),
    // ui-sidebar-terminal header entry `agent-terminals`: the displayed Session's terminal roster, then open.
    'terminal/watch': openStream([[]]),
  },
}
