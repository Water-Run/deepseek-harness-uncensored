/** Settings surface for the security-mode independent proxy and its captured traffic. */
import { useEffect, useId, useMemo, useState } from 'react'
import { Button, Input, Modal, StateDot, Switch, Tag, Toast, fileSizeText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  SecurityProxyFlowDetail,
  SecurityProxyFlowSummary,
  SecurityProxySettingsPatch,
  SecurityProxyState,
} from '@deepseek-ai/dsh-security-proxy/types'
import type { SecurityProxyFeedback, SecurityProxyFilter, SecurityProxyViewState } from './controller.ts'
import css from './SecurityProxySection.module.css'

/** Actions and shared state the section receives. */
export interface SecurityProxyInjected {
  hooks: { securityProxy: SnapshotStore<SecurityProxyViewState> }
  load: () => void
  refreshFlows: () => void
  configure: (patch: SecurityProxySettingsPatch) => Promise<boolean>
  setPassword: (password: string | null) => Promise<boolean>
  test: () => Promise<boolean>
  pause: (paused: boolean) => Promise<boolean>
  clear: () => Promise<void>
  openFlow: (id: string) => Promise<void>
  closeFlow: () => void
  setFilter: (patch: Partial<SecurityProxyFilter>) => void
  dismissFeedback: (id: number) => void
}

/** Props assembled by the settings renderer. */
export type SecurityProxySectionProps = PropsRuntime<'settings.mode.materials'>
  & PropsLocale<'settings.securityProxy'>
  & InjectFace<SecurityProxyInjected>

/** Actions and state the proxy-off reminder receives. */
export interface SecurityProxyWarningInjected {
  hooks: { securityProxyWarning: SnapshotStore<{ id: number } | null> }
  dismissWarning: (id: number) => void
}

/** Props assembled by the shell overlay renderer. */
export type SecurityProxyWarningProps = PropsRuntime<'shell.overlay'>
  & PropsLocale<'settings.securityProxy'>
  & InjectFace<SecurityProxyWarningInjected>

const STATUS_TONE = {
  off: 'idle',
  connecting: 'ongoing',
  ready: 'done',
  failed: 'error',
} as const

/** Format one capture timestamp in the viewer's locale. */
function timeText(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(at)
}

/**
 * Format one duration for the list.
 * @param ms - captured duration, or null while unfinished.
 * @param t - the bound locale.
 * @returns the localized duration or the absent marker.
 */
function durationText(ms: number | null, t: SecurityProxySectionProps['t']): string {
  if (ms === null) return '—'
  return ms < 1000
    ? t('securityProxy.durationMs', { ms })
    : t('securityProxy.durationSeconds', { seconds: (ms / 1000).toFixed(1) })
}

/** Format the captured size of one exchange. */
function sizeText(summary: SecurityProxyFlowSummary): string {
  return fileSizeText(summary.requestBytes + summary.responseBytes)
}

/** Render the security-proxy settings area inside Settings → Modes. */
export function SecurityProxySection(props: SecurityProxySectionProps) {
  const {
    modeId, useSecurityProxy, load, refreshFlows, configure, setPassword, test, pause, clear,
    openFlow, closeFlow, setFilter, dismissFeedback, t,
  } = props
  const view = useSecurityProxy(value => value)
  const state = view.state
  const feedbackId = useId()
  const [draft, setDraft] = useState<{ protocol?: 'http' | 'https'; host?: string; port?: string; username?: string }>({})
  const [password, setPasswordDraft] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => { if (modeId === 'security') load() }, [load, modeId])

  // Every mode material panel stays mounted so switching modes keeps drafts;
  // only the security one paints.
  if (modeId !== 'security') return null

  const settings = state?.settings
  const protocol = draft.protocol ?? settings?.protocol ?? 'http'
  const host = draft.host ?? settings?.host ?? ''
  const port = draft.port ?? (settings === undefined ? '8080' : String(settings.port))
  const username = draft.username ?? settings?.username ?? ''
  const dirty = draft.protocol !== undefined || draft.host !== undefined || draft.port !== undefined || draft.username !== undefined
  const portValue = Number(port)
  const invalid = host.trim() === '' || !Number.isInteger(portValue) || portValue < 1 || portValue > 65_535
  const busy = view.saving || view.testing

  const save = (): void => {
    if (invalid) return
    void configure({
      protocol,
      host: host.trim(),
      port: portValue,
      ...settings?.authEnabled === true ? { username } : {},
    }).then((ok) => { if (ok) setDraft({}) })
  }

  const status = state?.status ?? 'off'
  const failure = state?.failure ?? null

  if (view.loading && state === null) {
    return <section className={css.section} aria-busy="true"><p className={css.hint}>{t('securityProxy.status.connecting')}</p></section>
  }
  if (view.failed && state === null) {
    return <section className={css.section}><p role="alert">{t('securityProxy.failure.unknown')}</p>
      <Button size="sm" onClick={load}>{t('securityProxy.test')}</Button></section>
  }

  return <section className={css.section} aria-labelledby={`${feedbackId}-title`}>
    <h3 id={`${feedbackId}-title`} className={css.title}>{t('securityProxy.title')}</h3>
    <p className={css.intro}>{t('securityProxy.intro')}</p>

    <div className={css.row}>
      <div>
        <span>{t('securityProxy.enabled')}</span>
        <p className={css.hint}>{t('securityProxy.enabledHint')}</p>
      </div>
      <Switch
        label={t('securityProxy.enabled')}
        checked={settings?.enabled ?? false}
        disabled={view.saving}
        onChange={(value) => { void configure({ enabled: value }) }}
      />
    </div>

    <div className={css.status} role="status">
      <StateDot state={STATUS_TONE[status]} size={10} />
      <span>{t(`securityProxy.status.${status}`)}</span>
      {state?.latencyMs !== null && state?.latencyMs !== undefined && <span className={css.muted}>{t('securityProxy.latency', { ms: state.latencyMs })}</span>}
      <span className={css.muted}>
        {state?.checkedAt === null || state?.checkedAt === undefined
          ? t('securityProxy.neverChecked')
          : t('securityProxy.checkedAt', { time: timeText(state.checkedAt) })}
      </span>
    </div>
    {failure !== null && <p role="alert" className={css.error}>{t(`securityProxy.failure.${failure}`)}
      {state?.detail === null || state?.detail === undefined ? null : <span className={css.detail}> · {state.detail}</span>}
    </p>}

    <div className={css.grid}>
      <label className={css.field}>
        <span>{t('securityProxy.protocol')}</span>
        <select className={css.select} value={protocol} disabled={view.saving}
          onChange={(event) => { setDraft({ ...draft, protocol: event.target.value === 'https' ? 'https' : 'http' }) }}>
          <option value="http">{t('securityProxy.protocolHttp')}</option>
          <option value="https">{t('securityProxy.protocolHttps')}</option>
        </select>
      </label>
      <label className={css.field}>
        <span>{t('securityProxy.host')}</span>
        <Input value={host} placeholder={t('securityProxy.hostPlaceholder')} disabled={view.saving}
          onChange={(event) => { setDraft({ ...draft, host: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{t('securityProxy.port')}</span>
        <Input value={port} inputMode="numeric" disabled={view.saving}
          onChange={(event) => { setDraft({ ...draft, port: event.target.value }) }} />
      </label>
    </div>

    <div className={css.row}>
      <div>
        <span>{t('securityProxy.auth')}</span>
        <p className={css.hint}>{t('securityProxy.authHint')}</p>
      </div>
      <Switch label={t('securityProxy.auth')} checked={settings?.authEnabled ?? false} disabled={view.saving}
        onChange={(value) => { void configure({ authEnabled: value }) }} />
    </div>
    {settings?.authEnabled === true && <div className={css.grid}>
      <label className={css.field}>
        <span>{t('securityProxy.username')}</span>
        <Input value={username} disabled={view.saving}
          onChange={(event) => { setDraft({ ...draft, username: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{settings.hasPassword ? t('securityProxy.passwordConfigured') : t('securityProxy.password')}</span>
        <Input value={password} type="password" autoComplete="new-password" placeholder={t('securityProxy.passwordPlaceholder')}
          onChange={(event) => { setPasswordDraft(event.target.value) }} />
      </label>
      <div className={css.actions}>
        <Button size="sm" disabled={password === ''} onClick={() => { void setPassword(password).then((ok) => { if (ok) setPasswordDraft('') }) }}>
          {t('securityProxy.savePassword')}
        </Button>
        <Button size="sm" variant="outline" disabled={settings.hasPassword !== true}
          onClick={() => { void setPassword(null) }}>{t('securityProxy.clearPassword')}</Button>
      </div>
    </div>}

    {invalid && dirty && <p role="alert" className={css.error}>{t('securityProxy.invalid')}</p>}
    <div className={css.actions}>
      <Button size="sm" disabled={busy || !dirty || invalid} onClick={save}>{view.saving ? t('securityProxy.saving') : t('securityProxy.save')}</Button>
      <Button size="sm" variant="outline" disabled={busy || (settings?.enabled !== true && state?.checkedAt === null)} onClick={() => { void test() }}>
        {view.testing ? t('securityProxy.testing') : t('securityProxy.test')}
      </Button>
    </div>

    <div className={css.row}>
      <div>
        <span>{t('securityProxy.warnWhenDisabled')}</span>
        <p className={css.hint}>{t('securityProxy.warnHint')}</p>
      </div>
      <Switch label={t('securityProxy.warnWhenDisabled')} checked={settings?.warnWhenDisabled ?? false} disabled={view.saving}
        onChange={(value) => { void configure({ warnWhenDisabled: value }) }} />
    </div>

    <Coverage state={state} t={t} />

    <div className={css.capture}>
      <div className={css.captureHead}>
        <h4>{t('securityProxy.capture.title')}</h4>
        <span className={css.muted}>
          {t('securityProxy.capture.summary', {
            retained: state?.capture.retained ?? 0,
            total: state?.capture.total ?? 0,
            bytes: fileSizeText(state?.capture.bytes ?? 0),
          })}
        </span>
      </div>
      <div className={css.actions}>
        <Button size="sm" variant="outline" onClick={refreshFlows}>{t('securityProxy.capture.refresh')}</Button>
        <Button size="sm" variant="outline" onClick={() => { void pause(settings?.capturePaused !== true) }}>
          {settings?.capturePaused === true ? t('securityProxy.capture.resume') : t('securityProxy.capture.pause')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setConfirmClear(true) }}>{t('securityProxy.capture.clear')}</Button>
      </div>
      {settings?.capturePaused === true && <p className={css.hint}>{t('securityProxy.capture.paused')}</p>}
      <div className={css.filters}>
        <Input value={view.filter.text} placeholder={t('securityProxy.capture.filter')}
          onChange={(event) => { setFilter({ text: event.target.value }) }} />
        <select className={css.select} value={view.filter.kind} aria-label={t('securityProxy.capture.kindAll')}
          onChange={(event) => { setFilter({ kind: event.target.value as SecurityProxyFilter['kind'] }) }}>
          <option value="all">{t('securityProxy.capture.kindAll')}</option>
          <option value="http">{t('securityProxy.capture.kindHttp')}</option>
          <option value="tunnel">{t('securityProxy.capture.kindTunnel')}</option>
        </select>
      </div>
      {view.flowsFailed ? <p role="alert" className={css.error}>{t('securityProxy.capture.failed')}</p> : null}
      {view.flows.length === 0
        ? <p className={css.empty}>{t('securityProxy.capture.empty')}</p>
        : <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th scope="col">{t('securityProxy.capture.time')}</th>
                <th scope="col">{t('securityProxy.capture.session')}</th>
                <th scope="col">{t('securityProxy.capture.tool')}</th>
                <th scope="col">{t('securityProxy.capture.target')}</th>
                <th scope="col">{t('securityProxy.capture.status')}</th>
                <th scope="col">{t('securityProxy.capture.duration')}</th>
                <th scope="col">{t('securityProxy.capture.size')}</th>
              </tr>
            </thead>
            <tbody>
              {view.flows.map(flow => <tr key={flow.id} data-flow={flow.id}>
                <td>{timeText(flow.at)}</td>
                <td className={css.session} title={flow.sessionId ?? undefined}>
                  {flow.sessionId === null ? t('securityProxy.capture.sessionUnknown') : flow.sessionId.slice(0, 8)}
                </td>
                <td>{flow.tool}</td>
                <td className={css.target}>
                  <button type="button" className={css.targetButton} onClick={() => { void openFlow(flow.id) }}>
                    {flow.method} {flow.target}
                  </button>
                </td>
                <td>{flow.status === null ? (flow.kind === 'tunnel' ? '—' : t('securityProxy.detail.tunnel')) : flow.status}</td>
                <td>{durationText(flow.durationMs, t)}</td>
                <td>{sizeText(flow)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </div>

    <DetailDialog detail={view.detail} failed={view.detailFailed} onClose={closeFlow} t={t} />

    {confirmClear && <div className={css.confirm} role="alertdialog" aria-label={t('securityProxy.capture.clearConfirm')}>
      <p>{t('securityProxy.capture.clearConfirm')}</p>
      <div className={css.actions}>
        <Button size="sm" onClick={() => { setConfirmClear(false); void clear() }}>{t('securityProxy.capture.clearYes')}</Button>
        <Button size="sm" variant="outline" onClick={() => { setConfirmClear(false) }}>{t('securityProxy.capture.cancel')}</Button>
      </div>
    </div>}

    {view.feedback !== null && <Toast key={`${String(view.feedback.id)}-${view.feedback.code}`}
      text={t(feedbackText(view.feedback.code))}
      {...view.feedback.success ? { tone: 'success' as const } : {}}
      onDone={() => { dismissFeedback(view.feedback?.id ?? 0) }} />}
  </section>
}

/** The one-time reminder shown when security mode runs with the proxy off. */
export function SecurityProxyWarning({ useSecurityProxyWarning, dismissWarning, t }: SecurityProxyWarningProps) {
  const warning = useSecurityProxyWarning(value => value)
  if (warning === null) return null
  return <Toast key={String(warning.id)} text={t('securityProxy.warnToast')} onDone={() => { dismissWarning(warning.id) }} />
}

/** Map one feedback kind to its localized copy key. */
function feedbackText(code: SecurityProxyFeedback): 'securityProxy.saved' | 'securityProxy.saveFailed' | 'securityProxy.passwordSaved' | 'securityProxy.passwordFailed' {
  switch (code) {
    case 'saved': return 'securityProxy.saved'
    case 'saveFailed': return 'securityProxy.saveFailed'
    case 'passwordSaved': return 'securityProxy.passwordSaved'
    case 'passwordFailed': return 'securityProxy.passwordFailed'
  }
}

/** One coverage row list: what this build actually routes. */
function Coverage({ state, t }: { state: SecurityProxyState | null; t: SecurityProxySectionProps['t'] }) {
  const rows = useMemo(() => state?.coverage ?? [], [state])
  if (rows.length === 0) return null
  return <div className={css.coverage}>
    <h4>{t('securityProxy.coverage.title')}</h4>
    <ul>
      {rows.map(row => <li key={row.id}>
        <span>{t(`securityProxy.coverage.${row.id}`)}</span>
        <Tag {...row.code === 'captured' ? { tone: 'success' as const } : row.code === 'partial' ? { tone: 'warning' as const } : {}}>
          {t(`securityProxy.coverage.${row.code}`)}
        </Tag>
      </li>)}
    </ul>
  </div>
}

/** One exchange's stored headers and bodies. */
function DetailDialog({ detail, failed, onClose, t }: {
  detail: SecurityProxyFlowDetail | null
  failed: boolean
  onClose: () => void
  t: SecurityProxySectionProps['t']
}) {
  const open = detail !== null || failed
  return <Modal open={open} onClose={onClose} title={t('securityProxy.detail.title')} closeLabel={t('securityProxy.detail.close')}>
    {failed
      ? <p role="alert">{t('securityProxy.detail.failed')}</p>
      : detail !== null && <>
        <dl className={css.meta}>
          <div><dt>{t('securityProxy.capture.target')}</dt><dd>{detail.method} {detail.target}</dd></div>
          <div><dt>{t('securityProxy.capture.status')}</dt><dd>{detail.status ?? '—'}</dd></div>
          <div><dt>{t('securityProxy.capture.duration')}</dt><dd>{durationText(detail.durationMs, t)}</dd></div>
          <div><dt>{t('securityProxy.capture.size')}</dt><dd>{sizeText(detail)}</dd></div>
        </dl>
        {detail.kind === 'tunnel' && <p className={css.hint}>{t('securityProxy.detail.tunnel')}</p>}
        <HeaderTable title={t('securityProxy.detail.requestHeaders')} headers={detail.requestHeaders} />
        <HeaderTable title={t('securityProxy.detail.responseHeaders')} headers={detail.responseHeaders} />
        <BodyBlock title={t('securityProxy.detail.requestBody')} body={detail.requestBody} t={t} />
        <BodyBlock title={t('securityProxy.detail.responseBody')} body={detail.responseBody} t={t} />
        {detail.bodyTruncated && <p className={css.hint}>{t('securityProxy.detail.truncated')}</p>}
        <p className={css.hint}>{t('securityProxy.detail.redacted')}</p>
      </>}
  </Modal>
}

/** One header list, rendered as a definition table. */
function HeaderTable({ title, headers }: { title: string; headers: readonly { readonly name: string; readonly value: string }[] }) {
  if (headers.length === 0) return null
  return <section className={css.detailSection}>
    <h5>{title}</h5>
    <table className={css.headers}>
      <tbody>
        {headers.map((header, index) => <tr key={`${header.name}-${String(index)}`}>
          <th scope="row">{header.name}</th>
          <td>{header.value}</td>
        </tr>)}
      </tbody>
    </table>
  </section>
}

/** One captured body, bounded and scrollable. */
function BodyBlock({ title, body, t }: { title: string; body: string | null; t: SecurityProxySectionProps['t'] }) {
  return <section className={css.detailSection}>
    <h5>{title}</h5>
    {body === null ? <p className={css.hint}>{t('securityProxy.detail.noBody')}</p> : <pre className={css.body}>{body}</pre>}
  </section>
}
