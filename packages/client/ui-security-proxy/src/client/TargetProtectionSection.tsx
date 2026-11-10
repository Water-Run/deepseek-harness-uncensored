/** Owner target-rule settings in the existing Security mode panel. @module */
import { useEffect, useId, useState } from 'react'
import { Button, DisclosureRow, IconDataOutlineMedium, StateDot, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TargetProtectionSettingsUpdate } from '@deepseek-ai/dsh-target-protection/settings'
import type { TargetPreferences, TargetRule, TargetRuleId } from '@deepseek-ai/dsh-target-protection/types'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { TargetSettingsView } from './target-protection-controller.ts'
import { TargetRuleEditor } from './TargetRuleEditor.tsx'
import shared from './SecurityProxySection.module.css'
import css from './TargetProtectionSection.module.css'

interface TargetProtectionInjected {
  hooks: { targetSettings: SnapshotStore<TargetSettingsView> }
  load(): void
  save(update: TargetProtectionSettingsUpdate): Promise<boolean>
  updateCountry(): void
}

/** Props supplied by the mode configuration slot. */
export type TargetProtectionSectionProps = PropsRuntime<'settings.mode.materials'>
  & PropsLocale<'settings.securityProxy'> & InjectFace<TargetProtectionInjected>

type Draft = TargetProtectionSettingsUpdate & { generation: number }

function newRule(): TargetRule {
  return { id: randomUUID() as TargetRuleId, name: '', kind: 'server', environment: 'production',
    enabled: true, protection: 'full', match: 'host', address: '' }
}

/** Render stored rules and stage changes for a version-checked save. */
export function TargetProtectionSection({ modeId, useTargetSettings, load, save, updateCountry, t }: TargetProtectionSectionProps) {
  const view = useTargetSettings(value => value)
  const titleId = useId()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editor, setEditor] = useState<{ rule: TargetRule; existing: boolean; base: Draft } | null>(null)
  const [coverageOpen, setCoverageOpen] = useState(false)
  useEffect(() => { if (modeId === 'security') load() }, [load, modeId])
  if (modeId !== 'security') return null

  const state = view.value
  const routes = state?.routes
  const execution = state?.execution
  const databases = execution?.databases
  const ssh = execution?.ssh
  const missingRoute = routes !== undefined && (!routes.webFetch || !routes.independentProxy)
  const preferences = draft?.preferences ?? state?.snapshot.preferences
  const connectionChanged = draft !== null && draft.generation !== view.generation
  const revisionChanged = draft !== null && state !== null && draft.expectedRevision !== state.snapshot.revision
  const stage = (change: (value: TargetPreferences) => TargetPreferences): void => {
    if (state === null || view.saving || view.updatingCountry || connectionChanged || revisionChanged) return
    setDraft((current) => {
      const base = current ?? {
        expectedRevision: state.snapshot.revision, preferences: state.snapshot.preferences, generation: view.generation,
      }
      return { ...base, preferences: change(base.preferences) }
    })
  }
  const commit = (): void => {
    if (draft === null || state === null || connectionChanged || revisionChanged || missingRoute) return
    void save({ expectedRevision: draft.expectedRevision, preferences: draft.preferences }).then((ok) => { if (ok) setDraft(null) })
  }
  const discard = (): void => { setDraft(null); setEditor(null); load() }
  const busy = view.saving || view.updatingCountry || view.loading
  const editingDisabled = busy || state === null || connectionChanged || revisionChanged || missingRoute
  const edit = (rule: TargetRule, existing: boolean): void => {
    if (state === null) return
    const base = draft ?? {
      preferences: state.snapshot.preferences, expectedRevision: state.snapshot.revision, generation: view.generation,
    }
    setEditor({ rule, existing, base })
  }
  const country = state?.country
  const protection = state?.protection.state ?? 'unavailable'
  const problem = connectionChanged ? 'target.connectionChanged' : revisionChanged ? 'target.failure.conflict'
    : view.failure === null ? null : `target.failure.${view.failure}` as const

  return <section className={shared.section} aria-labelledby={titleId} aria-busy={busy}>
    <div className={css.heading}>
      <div><h3 id={titleId} className={shared.title}>{t('target.title')}</h3>
        <p className={shared.intro}>{t('target.intro')}</p>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={load}>{t('target.refresh')}</Button>
    </div>
    {view.loading && state === null && <p className={shared.hint}>{t('target.loading')}</p>}
    {problem !== null && <p className={view.failure === 'notMounted' ? shared.hint : shared.error} role="status">{t(problem)}</p>}
    {state !== null && <div className={shared.coverage}>
      <div className={shared.row}>
        <div><span>{t('target.mainland')}</span>
          <div className={shared.status}>
            <StateDot state={protection === 'enabled' ? 'done' : protection === 'disabled' ? 'idle' : 'warning'} size={10} />
            <span>{t(`target.state.${protection}`)}</span>
            <span className={shared.muted}>{t('target.revision', { revision: state.snapshot.revision })}</span>
          </div>
        </div>
        <Switch label={t('target.mainland')} checked={preferences?.mainlandEnabled ?? false} disabled={editingDisabled}
          onChange={(mainlandEnabled) => { stage(value => ({ ...value, mainlandEnabled })) }} />
      </div>
      {routes !== undefined && <dl className={css.routes}>
        <div className={shared.status}>
          <dt>{t('target.route.webFetch')}</dt>
          <dd><Tag>{t(routes.webFetch ? 'target.route.mounted' : 'target.route.missing')}</Tag></dd>
        </div>
        <div className={shared.status}>
          <dt>{t('target.route.independentProxy')}</dt>
          <dd><Tag>{t(routes.independentProxy ? 'target.route.mounted' : 'target.route.missing')}</Tag></dd>
        </div>
      </dl>}
      {execution !== undefined && <dl className={css.routes}>
        <div className={shared.status}>
          <dt>{t('target.execution.files')}</dt>
          <dd><Tag>{t(execution.files ? 'target.route.mounted' : 'target.route.missing')}</Tag></dd>
        </div>
        <div className={shared.status}>
          <dt>{t('target.execution.processes')}</dt>
          <dd><Tag>{t(`target.execution.${execution.processes}`)}</Tag></dd>
        </div>
      </dl>}
      {execution?.processes === 'admission-only' && <p className={shared.hint}>{t('target.execution.admissionHint')}</p>}
      {(execution?.processes === 'native-gateway' || execution?.processes === 'native-offline') &&
        <p className={shared.hint}>{t('target.execution.nativeHint')}</p>}
      {(databases !== undefined || ssh !== undefined) && <DisclosureRow icon={<IconDataOutlineMedium size={16} />}
        title={t('target.execution.more')} open={coverageOpen} expandable expandOnRowClick
        onToggle={() => { setCoverageOpen(value => !value) }}>
        <dl className={css.routes}>
          {ssh !== undefined && <div className={shared.status}>
            <dt>{t('target.execution.ssh')}</dt>
            <dd><Tag>{ssh.connections === 0 ? t('target.execution.sshMissing')
              : t('target.execution.sshReady', { count: ssh.connections })}</Tag></dd>
          </div>}
          {databases !== undefined && (['sqlite', 'postgres', 'mysql'] as const).map((engine) => {
            const count = databases[engine]
            return <div className={shared.status} key={engine}>
              <dt>{t(`target.execution.${engine}`)}</dt>
              <dd><Tag>{count === null ? t('target.route.missing') : t('target.execution.bindings', { count })}</Tag></dd>
            </div>
          })}
        </dl>
        {ssh !== undefined && ssh.pathProtectedConnections > 0 &&
          <p className={shared.hint}>{t('target.execution.sshPaths', { count: ssh.pathProtectedConnections })}</p>}
        <p className={shared.hint}>{t('target.execution.databaseHint')}</p>
      </DisclosureRow>}
      {missingRoute && <p className={shared.hint} role="status">{t('target.routesRequired')}</p>}
      <div className={shared.status}>
        <span className={shared.muted}>{t('target.country')}</span>
        {country == null ? <span>{t('target.countryMissing')}</span> : <>
          <Tag>{t(`target.country.${country.state}`)}</Tag>
          <time dateTime={country.builtAt}>{country.builtAt.slice(0, 10)}</time>
          <a className={css.link} href={country.attributionUrl} target="_blank" rel="noreferrer">{country.attribution}</a>
        </>}
        {state.countryUpdateAvailable === true && <Button variant="outline" size="sm" disabled={busy} onClick={updateCountry}>
          {t(view.updatingCountry ? 'target.countryUpdating' : 'target.countryUpdate')}
        </Button>}
      </div>
      {view.countryChecked && <span className={shared.muted} role="status">{t('target.countryChecked')}</span>}
    </div>}
    {preferences !== undefined && <>
      <div className={shared.actions}>
        <Button size="sm" variant="outline" disabled={editingDisabled}
          onClick={() => { edit(newRule(), false) }}>{t('target.add')}</Button>
      </div>
      {preferences.rules.length === 0 ? <p className={shared.hint}>{t('target.empty')}</p> :
        <ul className={css.rules}>{preferences.rules.map(rule => <li key={rule.id} className={css.rule}>
          <div className={css.ruleDetails}>
            <div className={shared.status}><strong>{rule.name}</strong>
              <Tag>{t(`target.kind.${rule.kind}`)}</Tag><Tag>{t(`target.environment.${rule.environment}`)}</Tag>
              {rule.environment === 'production' && <Tag>{t(`target.protection.${rule.protection}`)}</Tag>}
              {!rule.enabled && <Tag>{t('target.disabled')}</Tag>}
            </div>
            <span className={shared.muted}>{t(`target.match.${rule.match}`)} · {rule.address}
              {rule.port === undefined ? '' : `:${rule.port}`}{rule.database === undefined ? '' : ` / ${rule.database}`}</span>
          </div>
          <div className={shared.actions}>
            <Button size="sm" variant="ghost" disabled={editingDisabled}
              onClick={() => { edit(rule, true) }}>{t('target.edit')}</Button>
            <Button size="sm" variant="ghost" disabled={editingDisabled}
              onClick={() => { stage(value => ({ ...value, rules: value.rules.filter(item => item.id !== rule.id) })) }}>
              {t('target.remove')}
            </Button>
          </div>
        </li>)}</ul>}
    </>}
    {(draft !== null || view.saved) && <div className={shared.actions}>
      <span className={shared.muted} role="status">{t(draft === null ? 'target.saved' : 'target.unsaved')}</span>
      {draft !== null && <>
        <Button variant="outline" size="sm" disabled={busy} onClick={discard}>{t('target.discard')}</Button>
        <Button variant="primary" size="sm" disabled={editingDisabled} onClick={commit}>
          {t(view.saving ? 'target.saving' : 'target.save')}
        </Button>
      </>}
    </div>}
    {editor !== null && <TargetRuleEditor rule={editor.rule} existing={editor.existing} t={t}
      onClose={() => { setEditor(null) }} onApply={(rule) => {
        const { base } = editor
        const rules = editor.existing
          ? base.preferences.rules.map(item => item.id === rule.id ? rule : item) : [...base.preferences.rules, rule]
        setDraft({ ...base, preferences: { ...base.preferences, rules } })
        setEditor(null)
      }} />}
  </section>
}
