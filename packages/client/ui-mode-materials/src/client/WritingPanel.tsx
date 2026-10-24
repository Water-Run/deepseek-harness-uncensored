/**
 * Writing materials panel: the registry, its selection, and the documents.
 *
 * The panel edits documents through the version they were opened at, and a
 * failed save keeps the dialog and its text. Deleting a record removes the
 * registry entry only; the dialog says so before the action.
 */

import { useState, type ReactNode } from 'react'
import { Button, Checkbox, Input, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StoryEntryView, StoryListing, StorySection } from '@deepseek-ai/dsh-api-mode-dossiers/types'
import type { MaterialsFailure, MaterialsOperations, MaterialScope } from './contract.ts'
import { Field, FormModal, FailureNote, ProblemNote, type Translate } from './ui.tsx'
import css from './ModeMaterials.module.css'

/** Everything the writing panel needs from its registration. */
export interface WritingPanelProps {
  readonly operations: MaterialsOperations
  readonly t: Translate
  readonly scope: MaterialScope | undefined
  readonly listing: StoryListing | undefined
}

/** One material open in the editor. */
interface MaterialEditor {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly version: string
  readonly markdown: string
}

/** One pending new material. */
interface NewMaterial {
  readonly section: StorySection
  readonly name: string
  readonly title: string
  readonly markdown: string
}

/** Failure from a rejected operation. */
function failureOf(error: unknown): MaterialsFailure {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error
    && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code, message: error.message }
  }
  return { code: 'mode-dossier/unreadable', message: error instanceof Error ? error.message : String(error) }
}

/** One material row with its selection toggle and actions. */
function MaterialRow({ entry, t, busy, onToggle, onEdit, onDelete }: {
  readonly entry: StoryEntryView
  readonly t: Translate
  readonly busy: boolean
  readonly onToggle: (next: boolean) => void
  readonly onEdit: () => void
  readonly onDelete: () => void
}): ReactNode {
  return <li className={css.row} data-material-path={entry.path}>
    <span className={css.rowMain}>
      <span className={css.rowTitle}>{entry.title}</span>
      <span className={css.rowMeta}>
        {entry.path}
        {entry.bytes === undefined ? '' : ` · ${t('writing.bytes', { count: entry.bytes })}`}
      </span>
      {entry.missing ? <Tag tone="warning">{t('writing.missing')}</Tag> : null}
    </span>
    <span className={css.rowActions}>
      <Checkbox checked={entry.selected} disabled={busy || entry.missing} label={t('writing.select')}
        onChange={onToggle} />
      <Button variant="ghost" size="sm" disabled={busy || entry.missing} onClick={onEdit}>{t('edit')}</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>{t('delete')}</Button>
    </span>
  </li>
}

/** Render both material sections, the unregistered documents, and their dialogs. */
export function WritingPanel({ operations, t, scope, listing }: WritingPanelProps): ReactNode {
  const [editor, setEditor] = useState<MaterialEditor | undefined>(undefined)
  const [creating, setCreating] = useState<NewMaterial | undefined>(undefined)
  const [deleting, setDeleting] = useState<StoryEntryView | undefined>(undefined)
  const [failure, setFailure] = useState<MaterialsFailure | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const selected = listing?.selected ?? []
  const entries = listing?.entries ?? []

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      await work()
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (entry: StoryEntryView, next: boolean): Promise<void> => {
    if (scope === undefined) return
    await run(async () => {
      const paths = next
        ? [...selected, entry.path]
        : selected.filter(path => path !== entry.path)
      await operations.selectStory({ workspaceId: scope.workspaceId, selected: paths })
      await operations.load(scope.workspaceId)
    })
  }

  const openEditor = async (entry: StoryEntryView): Promise<void> => {
    if (scope === undefined) return
    await run(async () => {
      const document = await operations.readStory({ workspaceId: scope.workspaceId, path: entry.path })
      setEditor({
        workspaceId: scope.workspaceId,
        path: document.path,
        title: document.title,
        version: document.version,
        markdown: document.markdown,
      })
    })
  }

  const saveEditor = async (force: boolean): Promise<void> => {
    if (editor === undefined) return
    await run(async () => {
      let version = editor.version
      if (force) {
        // A conflict is resolved by taking the current file as the base on purpose.
        const current = await operations.readStory({ workspaceId: editor.workspaceId, path: editor.path })
        version = current.version
      }
      const document = await operations.writeStory({
        workspaceId: editor.workspaceId,
        path: editor.path,
        expectedVersion: version,
        markdown: editor.markdown,
      })
      setEditor({ ...editor, version: document.version, markdown: document.markdown })
      await operations.load(editor.workspaceId)
    })
  }

  const create = async (): Promise<void> => {
    if (creating === undefined || scope === undefined) return
    await run(async () => {
      await operations.createStory({
        workspaceId: scope.workspaceId,
        section: creating.section,
        name: creating.name,
        title: creating.title,
        markdown: creating.markdown,
      })
      setCreating(undefined)
      await operations.load(scope.workspaceId)
    })
  }

  const remove = async (): Promise<void> => {
    if (deleting === undefined || scope === undefined) return
    await run(async () => {
      await operations.removeStory({ workspaceId: scope.workspaceId, path: deleting.path })
      setDeleting(undefined)
      await operations.load(scope.workspaceId)
    })
  }

  const adopt = async (entry: StoryEntryView): Promise<void> => {
    if (scope === undefined) return
    await run(async () => {
      await operations.adoptStory({ workspaceId: scope.workspaceId, path: entry.path })
      await operations.load(scope.workspaceId)
    })
  }

  const conflict = failure?.code === 'mode-dossier/conflict'

  return <section className={css.section}>
    <h3 className={css.title}>{t('writing.title')}</h3>
    <p className={css.intro}>{t('writing.intro')}</p>
    {listing?.problem === undefined ? null : <ProblemNote problem={listing.problem} t={t} />}
    {failure === undefined
      ? null
      : <FailureNote failure={failure} t={t} />}
    <div className={css.toolbar}>
      <span className={css.counts}>{t('writing.selectedCount', { count: selected.length })}</span>
      <span className={css.spacer} />
      <Button variant="outline" size="sm" disabled={scope === undefined || busy}
        onClick={() => { setCreating({ section: 'style', name: '', title: '', markdown: '' }) }}>
        {t('writing.new')}
      </Button>
    </div>
    <p className={css.hint}>{t('writing.selectionHint')}</p>
    <p className={css.hint}>{t('writing.injectionNote')}</p>

    {(['style', 'bible'] as const).map((section) => {
      const rows = entries.filter(entry => entry.section === section)
      return <section key={section} className={css.group}>
        <div className={css.groupHead}>
          <h4 className={css.groupTitle}>{t(section === 'style' ? 'writing.style' : 'writing.bible')}</h4>
          <Tag tone="outline">{rows.length}</Tag>
        </div>
        {rows.length === 0
          ? <p className={css.hint}>{t('writing.empty')}</p>
          : <ul className={css.list}>
            {rows.map(entry => <MaterialRow key={entry.path} entry={entry} t={t} busy={busy}
              onToggle={(next) => { void toggle(entry, next) }}
              onEdit={() => { void openEditor(entry) }}
              onDelete={() => { setDeleting(entry) }} />)}
          </ul>}
      </section>
    })}

    {(listing?.unregistered.length ?? 0) === 0 ? null : <section className={css.group}>
      <h4 className={css.groupTitle}>{t('writing.unregistered')}</h4>
      <ul className={css.list}>
        {listing?.unregistered.map(entry => <li key={entry.path} className={css.row}>
          <span className={css.rowMain}>
            <span className={css.rowTitle}>{entry.title}</span>
            <span className={css.rowMeta}>{entry.path}</span>
          </span>
          <span className={css.rowActions}>
            <Button variant="ghost" size="sm" disabled={busy}
              onClick={() => { void adopt(entry) }}>{t('writing.adopt')}</Button>
          </span>
        </li>)}
      </ul>
    </section>}

    <FormModal open={editor !== undefined} title={editor?.path ?? ''}
      confirmLabel={busy ? t('saving') : t('save')} cancelLabel={t('cancel')} busy={busy}
      confirmDisabled={editor === undefined}
      onClose={() => { setEditor(undefined) }} onConfirm={() => { void saveEditor(false) }}>
      {editor === undefined ? null : <>
        {conflict
          ? <div className={css.conflict} role="alert">
            <p className={css.failureHead}>{t('conflict')}</p>
            <p className={css.failureBody}>{t('conflictHint')}</p>
            <Button variant="outline" size="sm" disabled={busy}
              onClick={() => { void saveEditor(true) }}>{t('save')}</Button>
          </div>
          : null}
        <Field label={t('writing.content')}>
          <textarea className={css.textareaWide} rows={16} value={editor.markdown}
            onChange={(event) => { setEditor({ ...editor, markdown: event.target.value }) }} />
        </Field>
      </>}
    </FormModal>

    <FormModal open={creating !== undefined} title={t('writing.newTitle')}
      confirmLabel={t('save')} cancelLabel={t('cancel')} busy={busy}
      confirmDisabled={creating === undefined || creating.name.trim() === ''}
      onClose={() => { setCreating(undefined) }} onConfirm={() => { void create() }}>
      {creating === undefined ? null : <>
        <Field label={t('writing.section')}>
          <select className={css.input} value={creating.section}
            onChange={(event) => {
              const section: StorySection = event.target.value === 'bible' ? 'bible' : 'style'
              setCreating({ ...creating, section })
            }}>
            <option value="style">{t('writing.style')}</option>
            <option value="bible">{t('writing.bible')}</option>
          </select>
        </Field>
        <Field label={t('writing.name')}>
          <Input value={creating.name} autoFocus
            onChange={(event) => { setCreating({ ...creating, name: event.target.value }) }} />
        </Field>
        <Field label={t('writing.titleField')}>
          <Input value={creating.title}
            onChange={(event) => { setCreating({ ...creating, title: event.target.value }) }} />
        </Field>
        <Field label={t('writing.content')}>
          <textarea className={css.textareaWide} rows={10} value={creating.markdown}
            onChange={(event) => { setCreating({ ...creating, markdown: event.target.value }) }} />
        </Field>
      </>}
    </FormModal>

    <Modal open={deleting !== undefined} onClose={() => { setDeleting(undefined) }}
      closeLabel={t('cancel')} title={t('writing.deleteTitle')} className={css.dialog as string}
      footer={<>
        <Button variant="outline" onClick={() => { setDeleting(undefined) }}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy} onClick={() => { void remove() }}>{t('delete')}</Button>
      </>}>
      <p className={css.intro}>{t('writing.deleteBody', { path: deleting?.path ?? '' })}</p>
    </Modal>
  </section>
}
