/**
 * Reverse-engineering panel: the analysis case workbench plus the honest tool
 * status and the read-only sample inventory.
 */

import { useState, type ReactNode } from 'react'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CaseCollectionView, SampleInspection, ToolStatus } from '@deepseek-ai/dsh-api-mode-dossiers/types'
import type { MaterialsFailure, MaterialsOperations, MaterialScope } from './contract.ts'
import { CaseWorkbench } from './CaseWorkbench.tsx'
import { ReaPanel } from './ReaPanel.tsx'
import { Field, FailureNote, type Translate } from './ui.tsx'
import css from './ModeMaterials.module.css'

/** Everything the reverse panel needs from its registration. */
export interface ReversePanelProps {
  readonly operations: MaterialsOperations
  readonly t: Translate
  readonly scope: MaterialScope | undefined
  readonly collection: CaseCollectionView | undefined
  readonly tools: readonly ToolStatus[]
}

/** Failure from a rejected operation. */
function failureOf(error: unknown): MaterialsFailure {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error
    && typeof error.code === 'string' && typeof error.message === 'string') {
    return { code: error.code, message: error.message }
  }
  return { code: 'mode-dossier/unreadable', message: error instanceof Error ? error.message : String(error) }
}

/** One tool row: its name, availability, and why it is not available. */
function ToolRow({ tool, t }: { readonly tool: ToolStatus; readonly t: Translate }): ReactNode {
  const key = tool.id === 'case-ledger' ? 'ledger' : tool.id === 'sample-inventory' ? 'inventory' : tool.id === 'report' ? 'report' : undefined
  return <li className={css.row} data-tool-id={tool.id}>
    <span className={css.rowMain}>
      <span className={css.rowTitle}>{key === undefined ? tool.name : t(`reverse.builtin.${key}`)}</span>
      <span className={css.rowMeta}>{key === undefined ? tool.detail : t(`reverse.builtin.${key}Detail`)}</span>
    </span>
    <Tag tone={tool.available ? 'success' : 'outline'}>
      {tool.available ? t('reverse.toolAvailable') : t('reverse.toolUnavailable')}
    </Tag>
  </li>
}

/** Render the case workbench, the tool status, and the sample inventory form. */
export function ReversePanel({ operations, t, scope, collection, tools }: ReversePanelProps): ReactNode {
  const [samplePath, setSamplePath] = useState('')
  const [inspection, setInspection] = useState<SampleInspection | undefined>(undefined)
  const [failure, setFailure] = useState<MaterialsFailure | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const inspect = async (): Promise<void> => {
    if (scope === undefined) return
    setBusy(true)
    setFailure(undefined)
    try {
      setInspection(await operations.inspectSample({ workspaceId: scope.workspaceId, path: samplePath }))
    } catch (error: unknown) {
      setFailure(failureOf(error))
    } finally {
      setBusy(false)
    }
  }

  return <>
    {operations.rea === undefined ? null : <ReaPanel operations={operations.rea} t={t} />}
    <CaseWorkbench kind="reverse" operations={operations} t={t} scope={scope} collection={collection}
      title={t('reverse.title')} intro={t('reverse.intro')}
      emptyText={t('reverse.empty')} />
    <section className={css.section}>
      <h3 className={css.title}>{t('reverse.sample')}</h3>
      <p className={css.hint}>{t('reverse.inspectHint')}</p>
      {failure === undefined ? null : <FailureNote failure={failure} t={t} />}
      <div className={css.inlineForm}>
        <Field label={t('reverse.samplePath')}>
          <Input value={samplePath} placeholder={t('reverse.samplePlaceholder')}
            onChange={(event) => { setSamplePath(event.target.value) }} />
        </Field>
        <Button variant="primary" size="sm" disabled={busy || scope === undefined || samplePath.trim() === ''}
          onClick={() => { void inspect() }}>
          {busy ? t('loading') : t('reverse.inspect')}
        </Button>
      </div>
      {inspection === undefined
        ? <p className={css.hint}>{t('reverse.sampleEmpty')}</p>
        : <dl className={css.facts}>
          <dt>{t('reverse.hash')}</dt><dd className={css.mono}>{inspection.sha256}</dd>
          <dt>{t('reverse.format')}</dt>
          <dd>{inspection.formats.length === 0 ? t('reverse.formatUnknown') : inspection.formats.join(', ')}</dd>
          <dt>{t('reverse.entropy')}</dt><dd>{inspection.entropy}</dd>
          <dt>{t('reverse.strings')}</dt>
          <dd>
            {inspection.strings.length === 0
              ? '—'
              : <ul className={css.strings}>
                {inspection.strings.map((value, index) => <li key={`${String(index)}:${value}`} className={css.mono}>{value}</li>)}
              </ul>}
            {inspection.stringsTruncated
              ? <span className={css.hint}>{t('reverse.stringsTruncated', { count: inspection.strings.length })}</span>
              : null}
          </dd>
        </dl>}
    </section>
    <section className={css.section}>
      <h3 className={css.title}>{t('reverse.tools')}</h3>
      <p className={css.hint}>{t('reverse.toolsHint')}</p>
      <ul className={css.list}>
        {tools.map(tool => <ToolRow key={tool.id} tool={tool} t={t} />)}
      </ul>
    </section>
  </>
}
