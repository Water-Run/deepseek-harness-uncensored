/**
 * Case workbench shared by the Security and Reverse panels.
 *
 * The list reads the workspace's case directories; opening one loads
 * `case.json`; every edit is one version-guarded mutation applied by the Host.
 * A conflicting write keeps the dialog and its text in place and reports the
 * conflict, so nothing the user typed is thrown away.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Input, Modal, Select, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CaseCollection,
  CaseCollectionView,
  CaseDocument,
  CaseMutation,
  CaseSummary,
  DossierCaseView,
  DossierKind,
} from '@deepseek-ai/dsh-api-mode-dossiers/types'
import type { MaterialsFailure, MaterialsOperations, MaterialScope } from './contract.ts'
import { Field, FormModal, FailureNote, ProblemNote, type Translate } from './ui.tsx'
import css from './ModeMaterials.module.css'

/** Everything the workbench needs from its panel. */
export interface CaseWorkbenchProps {
  readonly kind: DossierKind
  readonly operations: MaterialsOperations
  readonly t: Translate
  readonly scope: MaterialScope | undefined
  readonly collection: CaseCollectionView | undefined
  readonly title: string
  readonly intro: string
  readonly emptyText: string
  readonly protectionNote?: string | undefined
}

/** One record dialog: a new record or one being edited. */
interface RecordEditor {
  readonly collection: CaseCollection
  readonly id: string | null
  readonly fields: Record<string, string>
}

/** One open case, captured with the workspace it was opened from. */
interface OpenCase {
  readonly workspaceId: string
  readonly workspacePath: string
  readonly slug: string
  readonly view: DossierCaseView
}

/** A pending record deletion. */
interface PendingDelete {
  readonly collection: CaseCollection
  readonly id: string
}

/** One editable field of a case record. */
type FieldName = 'value' | 'label' | 'note' | 'kind' | 'ref' | 'title' | 'severity' | 'target' | 'cvss' | 'evidence' | 'status' | 'body'

/** Collection labels and their form fields. */
const COLLECTION_FIELDS: Readonly<Record<CaseCollection, readonly FieldName[]>> = {
  targets: ['value', 'label', 'note'],
  evidence: ['kind', 'ref', 'note'],
  findings: ['title', 'severity', 'target', 'cvss', 'evidence', 'status', 'note'],
  notes: ['title', 'body'],
}

/** Severity vocabulary the ledger accepts. */
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const

/** Empty fields for a new record of one collection. */
function emptyFields(collection: CaseCollection): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const name of COLLECTION_FIELDS[collection]) fields[name] = ''
  if (collection === 'evidence') fields.kind = 'note'
  if (collection === 'findings') fields.status = 'open'
  return fields
}

/** Fields of one stored record, ready for the editor. */
function fieldsOf(document: CaseDocument, collection: CaseCollection, id: string): Record<string, string> {
  const fields = emptyFields(collection)
  if (collection === 'targets') {
    const record = document.targets.find(entry => entry.id === id)
    if (record !== undefined) return { value: record.value, label: record.label, note: record.note }
    return fields
  }
  if (collection === 'evidence') {
    const record = document.evidence.find(entry => entry.id === id)
    if (record !== undefined) return { kind: record.kind, ref: record.ref, note: record.note }
    return fields
  }
  if (collection === 'findings') {
    const record = document.findings.find(entry => entry.id === id)
    if (record !== undefined) {
      return {
        title: record.title,
        severity: record.severity,
        target: record.target,
        cvss: record.cvss,
        evidence: record.evidence.join(', '),
        note: record.note,
        status: record.status,
      }
    }
    return fields
  }
  const record = document.notes.find(entry => entry.id === id)
  if (record !== undefined) return { title: record.title, body: record.body }
  return fields
}

/** Build the mutation one editor dialog submits. */
function mutationOf(editor: RecordEditor): CaseMutation {
  const fields = editor.fields
  const text = (name: string): string => fields[name] ?? ''
  if (editor.collection === 'targets') {
    const record = { value: text('value'), label: text('label'), note: text('note') }
    return editor.id === null
      ? { op: 'append', collection: 'targets', record }
      : { op: 'update', collection: 'targets', id: editor.id, record }
  }
  if (editor.collection === 'evidence') {
    const record = { kind: text('kind'), ref: text('ref'), note: text('note') }
    return editor.id === null
      ? { op: 'append', collection: 'evidence', record }
      : { op: 'update', collection: 'evidence', id: editor.id, record }
  }
  if (editor.collection === 'findings') {
    const record = {
      title: text('title'),
      severity: text('severity') === '' ? 'info' : text('severity'),
      target: text('target'),
      cvss: text('cvss'),
      evidence: text('evidence').split(',').map(part => part.trim()).filter(Boolean),
      note: text('note'),
      status: text('status'),
    }
    return editor.id === null
      ? { op: 'append', collection: 'findings', record }
      : { op: 'update', collection: 'findings', id: editor.id, record }
  }
  const record = { title: text('title'), body: text('body') }
  return editor.id === null
    ? { op: 'append', collection: 'notes', record }
    : { op: 'update', collection: 'notes', id: editor.id, record }
}

/** Failure from a rejected operation. */
function failureOf(error: unknown): MaterialsFailure {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error
    && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code, message: error.message }
  }
  return { code: 'mode-dossier/unreadable', message: error instanceof Error ? error.message : String(error) }
}

/** Rows of one collection, with their edit and delete actions. */
function RecordList({ collection, document, t, onEdit, onDelete }: {
  readonly collection: CaseCollection
  readonly document: CaseDocument
  readonly t: Translate
  readonly onEdit: (id: string) => void
  readonly onDelete: (id: string) => void
}): ReactNode {
  const rows = collection === 'targets'
    ? document.targets
    : collection === 'evidence'
      ? document.evidence
      : collection === 'findings'
        ? document.findings
        : document.notes
  if (rows.length === 0) return <p className={css.hint}>{t('security.noRecords')}</p>
  return <ul className={css.list}>
    {rows.map((row) => {
      const id = row.id
      const primary = 'value' in row
        ? row.value
        : 'ref' in row
          ? row.ref
          : row.title
      const secondary = 'label' in row && row.label !== ''
        ? row.label
        : 'kind' in row
          ? row.kind
          : 'severity' in row
            ? `${row.severity}${row.target === '' ? '' : ` · ${row.target}`}`
            : ''
      return <li key={id} className={css.row} data-record-id={id}>
        <span className={css.rowMain}>
          <span className={css.rowTitle}>{primary}</span>
          <span className={css.rowMeta}>{id}{secondary === '' ? '' : ` · ${secondary}`}</span>
        </span>
        <span className={css.rowActions}>
          <Button variant="ghost" size="sm" aria-label={`${t('edit')} ${id}`} onClick={() => { onEdit(id) }}>
            {t('edit')}
          </Button>
          <Button variant="ghost" size="sm" aria-label={`${t('delete')} ${id}`} onClick={() => { onDelete(id) }}>
            {t('delete')}
          </Button>
        </span>
      </li>
    })}
  </ul>
}

/** Render the case list, the open case, its record dialogs, and its report. */
export function CaseWorkbench(props: CaseWorkbenchProps): ReactNode {
  const { kind, operations, t, scope, collection, title, intro, emptyText, protectionNote } = props
  const [open, setOpen] = useState<OpenCase | undefined>(undefined)
  const [editor, setEditor] = useState<RecordEditor | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | undefined>(undefined)
  const [failure, setFailure] = useState<MaterialsFailure | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [objective, setObjective] = useState('')
  const [report, setReport] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState<{ slug: string; objective: string } | undefined>(undefined)

  // A case opened in one workspace stays bound to it; the detail states which.
  const document = open?.view.document
  useEffect(() => {
    setObjective(document?.objective ?? '')
  }, [document])

  const openCase = async (summary: CaseSummary): Promise<void> => {
    if (scope === undefined) return
    setFailure(undefined)
    setBusy(true)
    try {
      const view = await operations.readCase({ workspaceId: scope.workspaceId, kind, slug: summary.slug })
      setOpen({
        workspaceId: scope.workspaceId,
        workspacePath: scope.workspaceId,
        slug: summary.slug,
        view,
      })
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const submitEditor = async (): Promise<void> => {
    if (editor === undefined || open === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      const view = await operations.mutateCase({
        workspaceId: open.workspaceId,
        kind,
        slug: open.slug,
        expectedVersion: open.view.version,
        mutation: mutationOf(editor),
      })
      setOpen({ ...open, view })
      setEditor(undefined)
      await operations.load(open.workspaceId)
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const submitObjective = async (): Promise<void> => {
    if (open === undefined || objective === open.view.document.objective) return
    setBusy(true)
    setFailure(undefined)
    try {
      const view = await operations.mutateCase({
        workspaceId: open.workspaceId,
        kind,
        slug: open.slug,
        expectedVersion: open.view.version,
        mutation: { op: 'objective', objective },
      })
      setOpen({ ...open, view })
      await operations.load(open.workspaceId)
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteRecord = async (): Promise<void> => {
    if (pendingDelete === undefined || open === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      const view = await operations.mutateCase({
        workspaceId: open.workspaceId,
        kind,
        slug: open.slug,
        expectedVersion: open.view.version,
        mutation: { op: 'delete', collection: pendingDelete.collection, id: pendingDelete.id },
      })
      setOpen({ ...open, view })
      setPendingDelete(undefined)
      await operations.load(open.workspaceId)
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const showReport = async (): Promise<void> => {
    if (open === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      const rendered = await operations.renderReport({ workspaceId: open.workspaceId, kind, slug: open.slug })
      setReport(rendered.markdown)
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const createCase = async (): Promise<void> => {
    if (creating === undefined || scope === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      const view = await operations.createCase({
        workspaceId: scope.workspaceId, kind, slug: creating.slug, objective: creating.objective,
      })
      setCreating(undefined)
      setOpen({ workspaceId: scope.workspaceId, workspacePath: scope.workspaceId, slug: view.slug, view })
      await operations.load(scope.workspaceId)
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const summaryRows = useMemo(() => collection?.cases ?? [], [collection])

  return <section className={css.section}>
    <h3 className={css.title}>{title}</h3>
    <p className={css.intro}>{intro}</p>
    {protectionNote === undefined ? null : <p className={css.notice}>{protectionNote}</p>}
    {failure === undefined
      ? null
      : <FailureNote failure={failure} t={t} onRetry={() => { setFailure(undefined) }} />}
    {collection?.problem === undefined
      ? null
      : <ProblemNote problem={collection.problem} t={t} />}
    {open === undefined
      ? <>
        <div className={css.toolbar}>
          <span className={css.counts}>{collection === undefined ? '' : collection.cases.length}</span>
          <Button variant="outline" size="sm" disabled={scope === undefined || busy}
            onClick={() => { setCreating({ slug: '', objective: '' }) }}>
            {t('security.new')}
          </Button>
        </div>
        {summaryRows.length === 0
          ? <p className={css.hint}>{emptyText}</p>
          : <ul className={css.list}>
            {summaryRows.map(summary => <li key={summary.slug} className={css.row}>
              <button type="button" className={css.rowButton} onClick={() => { void openCase(summary) }}>
                <span className={css.rowTitle}>{summary.objective === '' ? summary.slug : summary.objective}</span>
                <span className={css.rowMeta}>
                  {summary.slug} · {t('security.counts', {
                    targets: summary.targets, evidence: summary.evidence,
                    findings: summary.findings, notes: summary.notes,
                  })}
                </span>
                <span className={css.rowMeta}>{t('security.updatedAt', { time: summary.updatedAt })}</span>
              </button>
            </li>)}
          </ul>}
        {collection?.broken.map(entry => <p key={entry.slug} className={css.problem} role="alert">
          {t('security.broken', { slug: entry.slug, reason: t(`problem.${entry.problem.code}`) })}
        </p>)}
      </>
      : <>
        <div className={css.toolbar}>
          <Button variant="ghost" size="sm" onClick={() => { setOpen(undefined); setFailure(undefined) }}>
            {t('back')}
          </Button>
          <span className={css.counts} title={open.workspacePath}>{open.slug}</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => { void showReport() }}>
            {t('security.report')}
          </Button>
        </div>
        {open.view.extraKeys.length === 0
          ? null
          : <p className={css.hint}>{t('security.extraKeys', { count: open.view.extraKeys.length })}</p>}
        <div className={css.card}>
          <Field label={t('security.objective')}>
            <textarea className={css.textarea} value={objective} rows={3}
              onChange={(event) => { setObjective(event.target.value) }} />
          </Field>
          <div className={css.toolbar}>
            <span className={css.spacer} />
            {objective === open.view.document.objective
              ? null
              : <span className={css.dirty}>{t('unsaved')}</span>}
            <Button variant="primary" size="sm"
              disabled={busy || objective === open.view.document.objective}
              onClick={() => { void submitObjective() }}>
              {busy ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
        <h4 className={css.subtitle}>{t('security.records')}</h4>
        {(['targets', 'evidence', 'findings', 'notes'] as const).map((collectionName) => {
          const count = collectionName === 'targets'
            ? open.view.document.targets.length
            : collectionName === 'evidence'
              ? open.view.document.evidence.length
              : collectionName === 'findings'
                ? open.view.document.findings.length
                : open.view.document.notes.length
          return <section key={collectionName} className={css.group}>
            <div className={css.groupHead}>
              <h5 className={css.groupTitle}>{t(`security.${collectionName}`)}</h5>
              <Tag tone="outline">{count}</Tag>
              <span className={css.spacer} />
              <Button variant="ghost" size="sm" disabled={busy}
                onClick={() => { setEditor({ collection: collectionName, id: null, fields: emptyFields(collectionName) }) }}>
                {t('add')}
              </Button>
            </div>
            <RecordList collection={collectionName} document={open.view.document} t={t}
              onEdit={(id) => { setEditor({ collection: collectionName, id, fields: fieldsOf(open.view.document, collectionName, id) }) }}
              onDelete={(id) => { setPendingDelete({ collection: collectionName, id }) }} />
          </section>
        })}
      </>}

    <FormModal open={creating !== undefined} title={t('security.newTitle')}
      confirmLabel={t('security.create')} cancelLabel={t('cancel')} busy={busy}
      confirmDisabled={(creating?.slug.trim() ?? '').length === 0}
      onClose={() => { setCreating(undefined) }} onConfirm={() => { void createCase() }}>
      <Field label={t('security.slug')} hint={t('security.slugHint')}>
        <Input value={creating?.slug ?? ''} autoFocus
          onChange={(event) => { setCreating(current => ({ slug: event.target.value, objective: current?.objective ?? '' })) }} />
      </Field>
      <Field label={t('security.objective')}>
        <textarea className={css.textarea} rows={3} value={creating?.objective ?? ''}
          onChange={(event) => { setCreating(current => ({ slug: current?.slug ?? '', objective: event.target.value })) }} />
      </Field>
    </FormModal>

    <FormModal open={editor !== undefined}
      title={t(editor?.id === null ? 'record.add' : 'record.edit', {
        collection: editor === undefined ? '' : t(`security.${editor.collection}`),
      })}
      confirmLabel={t('save')} cancelLabel={t('cancel')} busy={busy}
      confirmDisabled={editor === undefined}
      onClose={() => { setEditor(undefined) }} onConfirm={() => { void submitEditor() }}>
      {editor === undefined ? null : COLLECTION_FIELDS[editor.collection].map((name) => {
        const label = t(`field.${name}`)
        if (name === 'severity') {
          return <Field key={name} label={label}>
            <Select value={editor.fields[name] ?? 'info'} label={label}
              onChange={(value) => {
                setEditor(current => current === undefined ? current : { ...current, fields: { ...current.fields, [name]: value } })
              }} options={SEVERITIES.map(severity => ({ value: severity, label: severity }))} />
          </Field>
        }
        const value = editor.fields[name] ?? ''
        const onChange = (next: string): void => {
          setEditor(current => current === undefined ? current : { ...current, fields: { ...current.fields, [name]: next } })
        }
        if (name === 'note' || name === 'body') {
          return <Field key={name} label={label}>
            <textarea className={css.textarea} rows={4} value={value} onChange={(event) => { onChange(event.target.value) }} />
          </Field>
        }
        return <Field key={name} label={label} hint={name === 'evidence' ? t('record.evidenceHint') : undefined}>
          <Input value={value} onChange={(event) => { onChange(event.target.value) }} />
        </Field>
      })}
    </FormModal>

    <Modal open={pendingDelete !== undefined} onClose={() => { setPendingDelete(undefined) }}
      closeLabel={t('cancel')} title={t('record.deleteTitle')} className={css.dialog as string}
      footer={<>
        <Button variant="outline" onClick={() => { setPendingDelete(undefined) }}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy} onClick={() => { void deleteRecord() }}>{t('delete')}</Button>
      </>}>
      <p className={css.intro}>{t('record.deleteBody')}</p>
      <p className={css.rowMeta}>{pendingDelete?.id}</p>
    </Modal>

    <Modal open={report !== undefined} onClose={() => { setReport(undefined) }}
      closeLabel={t('close')} title={t('security.reportTitle')} className={css.reportDialog as string}
      footer={<Button variant="outline" onClick={() => { setReport(undefined) }}>{t('close')}</Button>}>
      <pre className={css.report}>{report ?? ''}</pre>
    </Modal>
  </section>
}
