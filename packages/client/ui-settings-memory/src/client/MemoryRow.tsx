/**
 * The General-settings row for cross-conversation memory: a summary line and
 * a manager covering search, scope and type filters, add/edit, enable/disable,
 * and delete. All stored state arrives from the injected snapshot store; the
 * draft itself is owned by the controller so navigating away never loses an
 * edit.
 */

import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemoryRecord, MemoryType } from '@deepseek-ai/dsh-memory/types'
import type { MemorySettingsLocaleKey } from './locales.ts'
import type { MemoryDraft, MemoryRowFace } from './memory-controller.ts'
import css from './MemoryRow.module.css'

/** Props the renderer binds for the memory row. */
export type MemoryRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.memory'>
  & InjectFace<MemoryRowFace>

/** Locale key of each classification option. */
const TYPE_KEYS: Record<MemoryType, MemorySettingsLocaleKey> = {
  preference: 'typePreference',
  'project-fact': 'typeProjectFact',
  'operation-result': 'typeOperationResult',
  'writing-setting': 'typeWritingSetting',
}

/** Locale key of each classification filter option. */
const TYPE_FILTERS: readonly { value: string; label: MemorySettingsLocaleKey }[] = [
  { value: 'all', label: 'typeAll' },
  { value: 'preference', label: 'typePreference' },
  { value: 'project-fact', label: 'typeProjectFact' },
  { value: 'operation-result', label: 'typeOperationResult' },
  { value: 'writing-setting', label: 'typeWritingSetting' },
]

/**
 * Render the memory row and its manager.
 * @param props - composed slot props: locale copy, the snapshot store, and actions.
 * @returns the row.
 */
export function MemoryRow(props: MemoryRowProps) {
  const { t, open } = props
  const state = props.useMemories(snapshot => snapshot)
  const [managerOpen, setManagerOpen] = useState(false)

  useEffect(() => {
    void open()
  }, [open])

  return (
    <div className={css.row}>
      <div className={css.rowHeader}>
        <div>
          <div className={css.rowTitle}>{t('rowTitle')}</div>
          <p className={css.rowDescription}>{t('rowDescription')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setManagerOpen(true)
            void props.reload()
          }}
        >
          {t('manage')}
        </Button>
      </div>
      <p className={css.rowDescription}>
        {t('count')}: {String(state.records.length)}
      </p>
      <Modal
        open={managerOpen}
        onClose={() => { setManagerOpen(false) }}
        title={t('rowTitle')}
        closeLabel={t('close')}
        contentClassName={css.panel ?? ''}
      >
        <Filters props={props} />
        {state.description !== undefined && (
          <dl className={css.limits}>
            <div><dt>{t('limitEntries')}</dt><dd>{String(state.description.limits.maxEntries)}</dd></div>
            <div><dt>{t('limitChars')}</dt><dd>{String(state.description.limits.maxEntryChars)}</dd></div>
            <div><dt>{t('limitBytes')}</dt><dd>{String(state.description.limits.maxContextBytes)}</dd></div>
          </dl>
        )}
        {state.error !== undefined && state.error !== 'scopeRequired' && (
          <p className={css.error}>{t(state.error)}</p>
        )}
        {state.draft === undefined
          ? (
            <RecordList props={props} records={state.records} confirming={state.confirming} loading={state.loading} />
          )
          : <DraftForm props={props} draft={state.draft} saving={state.saving} />}
      </Modal>
    </div>
  )
}

/**
 * Render the search field and filters.
 * @param props - the row's actions and locale copy.
 * @returns the filter bar.
 */
function Filters({ props }: { props: MemoryRowProps }) {
  const { t } = props
  const description = props.useMemories(snapshot => snapshot.description)
  const scope = props.useMemories(snapshot => snapshot.scope)
  const type = props.useMemories(snapshot => snapshot.type)
  const [text, setText] = useState('')
  return (
    <div className={css.filters}>
      <Input
        value={text}
        placeholder={t('searchPlaceholder')}
        aria-label={t('search')}
        onChange={(event) => { setText(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void props.search(text)
        }}
      />
      <select
        className={css.select}
        aria-label={t('scopeAll')}
        value={scope}
        onChange={(event) => { void props.filterScope(event.target.value) }}
      >
        <option value="all">{t('scopeAll')}</option>
        <option value="global">{t('scopeGlobal')}</option>
        {(description?.workspaces ?? []).map(option => (
          <option key={option.value} value={option.value}>{`${t('scopeWorkspace')}: ${option.label}`}</option>
        ))}
        {(description?.modes ?? []).map(option => (
          <option key={option.value} value={option.value}>{`${t('scopeMode')}: ${option.label}`}</option>
        ))}
      </select>
      <select
        className={css.select}
        aria-label={t('typeAll')}
        value={type}
        onChange={(event) => { void props.filterType(event.target.value) }}
      >
        {TYPE_FILTERS.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
      </select>
      <Button variant="primary" size="sm" onClick={() => { props.addDraft() }}>{t('add')}</Button>
    </div>
  )
}

/**
 * Render the stored records with their per-record actions.
 * @param props - the row's actions and locale copy.
 * @param records - records the Host returned for the current filters.
 * @param confirming - record awaiting delete confirmation.
 * @param loading - whether the first read is still pending.
 * @returns the list.
 */
function RecordList({ props, records, confirming, loading }: {
  props: MemoryRowProps
  records: readonly MemoryRecord[]
  confirming: MemoryRecord['id'] | undefined
  loading: boolean
}) {
  const { t } = props
  if (loading) return <p className={css.rowDescription}>{t('loading')}</p>
  if (records.length === 0) return <p className={css.rowDescription}>{t('empty')}</p>
  return (
    <ul className={css.list}>
      {records.map(record => (
        <li key={record.id} className={css.record}>
          <div className={css.meta}>
            <span className={css.badge}>{t(TYPE_KEYS[record.type])}</span>
            <span className={css.scope}>{scopeText(record, t)}</span>
            <span className={css.scope}>
              {record.status === 'enabled' ? t('statusEnabled') : t('statusDisabled')}
            </span>
          </div>
          {record.title !== undefined && <div className={css.recordTitle}>{record.title}</div>}
          <p className={css.content}>{record.content}</p>
          {confirming === record.id && (
            <div className={css.confirm}>
              <span>{t('confirmDelete')}</span>
              <Button variant="outline" size="sm" onClick={() => { props.cancelDelete() }}>{t('cancel')}</Button>
              <Button variant="primary" size="sm" onClick={() => { void props.confirmDelete() }}>{t('delete')}</Button>
            </div>
          )}
          <div className={css.actions}>
            <Button variant="outline" size="sm" onClick={() => { props.editDraft(record) }}>{t('edit')}</Button>
            <Button variant="ghost" size="sm" onClick={() => { void props.toggleStatus(record) }}>
              {record.status === 'enabled' ? t('disable') : t('enable')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { props.askDelete(record) }}>{t('delete')}</Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Render the add/edit form.
 * @param props - the row's actions and locale copy.
 * @param draft - the draft being edited.
 * @param saving - whether a write is in flight.
 * @returns the form.
 */
function DraftForm({ props, draft, saving }: { props: MemoryRowProps; draft: MemoryDraft; saving: boolean }) {
  const { t } = props
  const description = props.useMemories(snapshot => snapshot.description)
  const error = props.useMemories(snapshot => snapshot.error)
  return (
    <div className={css.form}>
      <label className={css.field}>
        <span>{t('content')}</span>
        <textarea
          className={css.textarea}
          value={draft.content}
          rows={4}
          data-modal-autofocus
          onChange={(event) => { props.changeDraft({ content: event.target.value }) }}
        />
      </label>
      <label className={css.field}>
        <span>{t('titleField')}</span>
        <Input value={draft.title} onChange={(event) => { props.changeDraft({ title: event.target.value }) }} />
      </label>
      <label className={css.field}>
        <span>{t('typeAll')}</span>
        <select
          className={css.select}
          value={draft.type}
          onChange={(event) => { props.changeDraft({ type: event.target.value as MemoryType }) }}
        >
          {(Object.keys(TYPE_KEYS) as MemoryType[]).map(type => (
            <option key={type} value={type}>{t(TYPE_KEYS[type])}</option>
          ))}
        </select>
      </label>
      <label className={css.field}>
        <span>{t('topicField')}</span>
        <Input value={draft.topic} onChange={(event) => { props.changeDraft({ topic: event.target.value }) }} />
        <small className={css.hint}>{t('topicHint')}</small>
      </label>
      <label className={css.toggleRow}>
        <span>{t('shareGlobal')}</span>
        <Switch
          checked={draft.shareGlobal}
          label={t('shareGlobal')}
          onChange={(checked) => { props.changeDraft({ shareGlobal: checked }) }}
        />
      </label>
      <p className={css.hint}>{t('shareGlobalHint')}</p>
      {!draft.shareGlobal && (
        <div className={css.filters}>
          <label className={css.field}>
            <span>{t('workspace')}</span>
            <select
              className={css.select}
              value={draft.workspace}
              onChange={(event) => { props.changeDraft({ workspace: event.target.value }) }}
            >
              <option value="">{t('noWorkspace')}</option>
              {(description?.workspaces ?? []).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            <span>{t('mode')}</span>
            <select
              className={css.select}
              value={draft.mode}
              onChange={(event) => { props.changeDraft({ mode: event.target.value }) }}
            >
              <option value="">{t('noMode')}</option>
              {(description?.modes ?? []).map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {error === 'conflict' && <p className={css.hint}>{t('conflictHint')}</p>}
      <div className={css.actions}>
        <Button variant="outline" size="sm" onClick={() => { props.cancelDraft() }}>{t('cancel')}</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={saving || draft.content.trim() === ''}
          onClick={() => { void props.saveDraft() }}
        >
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Human spelling of one record's scope.
 * @param record - the stored record.
 * @param t - locale lookup.
 * @returns the scope label.
 */
function scopeText(record: MemoryRecord, t: (key: MemorySettingsLocaleKey) => string): string {
  if (record.scope.global) return t('scopeGlobal')
  return [record.scope.workspace, record.scope.mode].filter((part): part is string => part !== undefined).join(' · ')
}
