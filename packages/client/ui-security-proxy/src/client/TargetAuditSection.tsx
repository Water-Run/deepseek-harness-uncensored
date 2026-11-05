/** Read-only inspection of the owner's persisted admission checks. @module */
import { useEffect, useState } from 'react'
import { Button, Input, Select, StateDot, Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TargetAuditEntry } from '@deepseek-ai/dsh-target-protection/settings'
import type { TargetAuditView } from './target-audit-controller.ts'
import shared from './SecurityProxySection.module.css'
import css from './TargetAuditSection.module.css'

interface TargetAuditInjected {
  hooks: { targetAudit: SnapshotStore<TargetAuditView> }
  load(): void
}

/** Props assembled by the mode configuration slot. */
export type TargetAuditSectionProps = PropsRuntime<'settings.mode.materials'>
  & PropsLocale<'settings.securityProxy'> & InjectFace<TargetAuditInjected>

const decisions = ['allow', 'deny', 'cancelled', 'error'] as const
const tones = { allow: 'success', deny: 'danger', cancelled: 'warning', error: 'danger' } as const satisfies Record<
  TargetAuditEntry['decision'], TagTone
>

function AuditEntry({ entry, t }: { entry: TargetAuditEntry; t: TargetAuditSectionProps['t'] }) {
  const [open, setOpen] = useState(false)
  const timestamp = new Intl.DateTimeFormat(undefined, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(entry.at)
  return <li className={css.entry}>
    <div className={css.head}>
      <div className={css.summary}>
        <time dateTime={new Date(entry.at).toISOString()}>{timestamp}</time>
        <Tag tone={tones[entry.decision]}>{t(`audit.decision.${entry.decision}`)}</Tag>
        <span>{t(`audit.operation.${entry.operation}`)}</span>
        <span className={shared.muted}>{entry.revision === null ? t('audit.revisionUnknown')
          : t('audit.revision', { revision: entry.revision })}</span>
      </div>
      <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>{t('audit.details')}</Button>
    </div>
    {entry.code !== null && <p className={css.reason}>{t(`audit.reason.${entry.code}`)}</p>}
    {open && <dl className={css.details}>
      <div><dt>{t(`audit.phase.${entry.phase}`)}</dt><dd>{t(`audit.effect.${entry.effect}`)}</dd></div>
      <div><dt>{t('audit.session')}</dt><dd><code>{entry.source?.sessionId ?? t('audit.sourceUnknown')}</code></dd></div>
      {entry.source?.parentSessionId !== undefined && <div><dt>{t('audit.parent')}</dt><dd><code>{entry.source.parentSessionId}</code></dd></div>}
      {entry.code !== null && <div><dt>{t('audit.code')}</dt><dd><code>{entry.code}</code></dd></div>}
      <div><dt>{t('audit.target')}</dt><dd><code>{entry.fingerprint ?? t('audit.none')}</code></dd></div>
      {entry.peerFingerprint !== null && <div><dt>{t('audit.peer')}</dt><dd><code>{entry.peerFingerprint}</code></dd></div>}
      <div><dt>{t('audit.rules')}</dt><dd>
        <span>{t('audit.matches', { count: entry.matchedRules })}</span>
        {entry.ruleIds.length > 0 && <ul className={css.ruleIds}>{entry.ruleIds.map(id => <li key={id}><code>{id}</code></li>)}</ul>}
        {entry.matchedRules > entry.ruleIds.length && <span>
          {t('audit.truncated', { shown: entry.ruleIds.length, total: entry.matchedRules })}
        </span>}
      </dd></div>
    </dl>}
  </li>
}

/**
 * Expand recent audit checks without exposing raw targets or credentials.
 * @param props - Current mode, audit snapshot, refresh action and localized copy.
 * @returns The Security-mode audit panel, or null for other modes.
 */
export function TargetAuditSection({ modeId, useTargetAudit, load, t }: TargetAuditSectionProps) {
  const view = useTargetAudit(value => value)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [decision, setDecision] = useState<'all' | TargetAuditEntry['decision']>('all')
  const [shown, setShown] = useState(10)
  useEffect(() => { if (modeId === 'security' && open) load() }, [modeId, open, load])
  if (modeId !== 'security') return null
  const history = view.history
  const search = text.trim().toLowerCase()
  const entries = history?.entries.filter(entry => (decision === 'all' || entry.decision === decision)
    && (search === '' || JSON.stringify(entry).toLowerCase().includes(search))) ?? []
  return <section className={shared.section} aria-label={t('audit.title')} aria-busy={view.loading}>
    <div className={css.head}>
      <div><h3 className={shared.title}>{t('audit.title')}</h3><p className={shared.intro}>{t('audit.hint')}</p></div>
      <div className={shared.actions}>
        {open && <Button size="sm" variant="outline" disabled={view.loading} onClick={load}>{t('audit.refresh')}</Button>}
        <Button size="sm" variant="outline" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
          {t(open ? 'audit.close' : 'audit.open')}
        </Button>
      </div>
    </div>
    {open && <>
      {history !== null && <div className={shared.status} role="status">
        <StateDot state={history.state === 'ready' ? 'done' : history.state === 'off' ? 'idle' : 'error'} size={10} />
        <span>{t(`audit.state.${history.state}`)}</span>
      </div>}
      {history?.state === 'unavailable' && <p className={shared.error} role="alert">{t('audit.unavailable')}</p>}
      {view.failure !== null && <p className={shared.error} role="status">{t(`audit.failure.${view.failure}`)}</p>}
      {view.loading && history === null ? <div className={css.skeleton} aria-busy="true"><i /><i /><i /></div>
        : history !== null && <>
          {history.entries.length > 0 && <div className={css.filters}>
            <Input aria-label={t('audit.search')} placeholder={t('audit.search')} value={text}
              onChange={(event) => { setText(event.currentTarget.value); setShown(10) }} />
            <Select label={t('audit.filter')} value={decision} options={[
              { value: 'all', label: t('audit.all') }, ...decisions.map(value => ({ value, label: t(`audit.decision.${value}`) })),
            ]} onChange={(value) => { setDecision(value); setShown(10) }} />
          </div>}
          {entries.length === 0 ? <p className={shared.hint}>{t('audit.empty')}</p>
            : <ul className={css.entries}>{entries.slice(0, shown).map(entry => <AuditEntry key={entry.id} entry={entry} t={t} />)}</ul>}
          {entries.length > shown && <Button size="sm" variant="outline" onClick={() => { setShown(value => value + 10) }}>
            {t('audit.more')}
          </Button>}
        </>}
    </>}
  </section>
}
