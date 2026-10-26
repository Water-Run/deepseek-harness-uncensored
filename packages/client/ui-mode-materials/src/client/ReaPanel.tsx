/** Owner configuration and explicit connection check for external REA engines. @module */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Input, Select, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReaOptions, ReaProbe } from '@deepseek-ai/dsh-api-mode-dossiers/types'
import type { MaterialsOperations } from './contract.ts'
import { Field, type Translate } from './ui.tsx'
import css from './ReaPanel.module.css'

/** Fields expose host paths, without guessing another client's installation. */
const PATH_FIELDS = ['nodePath', 'cliPath', 'ghidraPath', 'javaHome', 'idaConfig'] as const

/**
 * Render external engine configuration inside Reverse settings.
 * @param props - Typed owner operations and localized copy.
 * @returns Compact form, connection status, and searchable discovered tool names.
 */
export function ReaPanel({ operations, t }: { operations: NonNullable<MaterialsOperations['rea']>; t: Translate }): ReactNode {
  const [options, setOptions] = useState<ReaOptions>()
  const [saved, setSaved] = useState<ReaOptions>()
  const [revision, setRevision] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [probe, setProbe] = useState<ReaProbe>()
  const [query, setQuery] = useState('')
  const lifetime = useRef<AbortController>()
  const load = async (signal: AbortSignal): Promise<void> => {
    const value = await operations.load(signal)
    if (signal.aborted) return
    if (value === null) { setError(t('rea.unavailable')); return }
    setOptions(value.options); setSaved(value.options); setRevision(value.revision)
  }
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    void load(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure))
    })
    return () => { controller.abort() }
  }, [operations])
  const run = async (kind: 'save' | 'probe'): Promise<void> => {
    const signal = lifetime.current?.signal
    if (signal === undefined || signal.aborted || options === undefined) return
    const canceled = (): boolean => signal.aborted
    setBusy(true); setError('')
    try {
      if (kind === 'save') {
        if (revision === null) throw new Error(t('rea.unavailable'))
        await operations.save(options, revision, signal)
        await load(signal)
        if (!canceled()) setProbe(undefined)
      } else {
        const result = await operations.probe(signal)
        if (!canceled()) setProbe(result)
      }
    } catch (failure) {
      if (!canceled()) setError(failure instanceof Error ? failure.message : String(failure))
    } finally { if (!canceled()) setBusy(false) }
  }
  const dirty = JSON.stringify(options) !== JSON.stringify(saved)
  return <section className={css.panel} aria-label={t('rea.title')}>
    <header className={css.heading}>
      <div><h3>{t('rea.title')}</h3><p>{t('rea.intro')}</p></div>
      <Switch checked={options?.enabled ?? false} disabled={busy || options === undefined}
        label={t('rea.enable')} onChange={(enabled) =>{  setOptions(value => value === undefined ? value : { ...value, enabled }) }} />
    </header>
    {options === undefined ? null : <>
      <div className={css.fields}>
        {PATH_FIELDS.map(key => <Field key={key} label={t(`rea.${key}`)}>
          <Input value={options[key]} disabled={busy} placeholder={t(`rea.${key}Hint`)}
            onChange={(event) =>{  setOptions({ ...options, [key]: event.target.value }) }} />
        </Field>)}
        <Field label={t('rea.provider')}><Select value={options.provider} disabled={busy} label={t('rea.provider')}
          options={(['auto', 'ghidra', 'ida', 'hopper', 'kuna'] as const).map(value => ({ value, label: value === 'auto' ? t('rea.auto') : value }))}
          onChange={(provider) =>{  setOptions({ ...options, provider }) }} /></Field>
      </div>
      <p className={css.note}>{t('rea.note')}</p>
      <div className={css.actions}>
        <Button size="sm" variant="primary" disabled={busy || !dirty || revision === null || (options.enabled && (!options.nodePath.trim() || !options.cliPath.trim()))}
          onClick={() => { void run('save') }}>{busy ? t('saving') : t('save')}</Button>
        <Button size="sm" variant="outline" disabled={busy || dirty || !saved?.enabled}
          onClick={() => { void run('probe') }}>{t('rea.check')}</Button>
        <span>{dirty ? t('unsaved') : t('rea.saved')}</span>
      </div>
    </>}
    {error === '' ? null : <div className={css.error} role="alert">{t('rea.failed', { reason: error })}</div>}
    {probe === undefined || dirty ? null : <div className={css.result}>
      <strong>{probe.name} {probe.version}</strong><span>{t('rea.connected', { count: probe.toolCount })}</span>
      <p>{t('rea.engineNote')}</p>
      <dl className={css.engines}>{probe.engines.map(engine => <div key={engine.name}>
        <dt>{engine.name}</dt><dd>{t(`rea.engine.${engine.state}`)}</dd>
      </div>)}</dl>
      <details><summary>{t('rea.catalog')}</summary>
        <Input value={query} placeholder={t('rea.search')} aria-label={t('rea.search')} onChange={(event) =>{  setQuery(event.target.value) }} />
        <ul>{probe.tools.filter(name => name.toLowerCase().includes(query.trim().toLowerCase()))
          .map(name => <li key={name}>{name}</li>)}</ul>
      </details>
    </div>}
  </section>
}
