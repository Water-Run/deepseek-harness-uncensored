/** General Settings row for the one-shot quick-question reasoning level. */
import { useEffect, useState } from 'react'
import { PreferenceRow } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  BTW_REASONING_EFFORTS, type AsideReasoningSnapshot, type BtwReasoningEffort,
} from './reasoning-settings.ts'

/** Loader and writer supplied by the aside owner. */
export interface AsideReasoningInjected {
  readonly load: () => Promise<AsideReasoningSnapshot>
  readonly save: (value: BtwReasoningEffort) => Promise<AsideReasoningSnapshot>
}

/** Full row props. */
export type AsideReasoningProps = PropsLocale<'command'> & InjectFace<AsideReasoningInjected>

/**
 * Render the quick-question level control.
 * @param props - locale seat plus the load and save operations.
 * @returns the General Settings row.
 */
export function AsideReasoningRow({ load, save, t }: AsideReasoningProps) {
  const [state, setState] = useState<AsideReasoningSnapshot>({ status: 'loading', value: 'low', writable: false })

  useEffect(() => {
    let current = true
    void load().then((next) => { if (current) setState(next) }, () => {
      if (current) setState({ status: 'unavailable', value: 'low', writable: false })
    })
    return () => { current = false }
  }, [load])

  const labels: Record<BtwReasoningEffort, string> = {
    off: t('aside.reasoning.off'),
    low: t('aside.reasoning.low'),
    high: t('aside.reasoning.high'),
    max: t('aside.reasoning.max'),
  }
  const busy = state.status === 'loading' || state.status === 'saving'
  const feedback = state.status === 'error'
    ? t('aside.reasoning.error')
    : state.status === 'unavailable' ? t('aside.reasoning.unavailable') : undefined
  return <PreferenceRow
    title={t('aside.reasoning.title')}
    description={t('aside.reasoning.description')}
    feedback={feedback}
    value={state.value}
    selectedLabel={labels[state.value]}
    options={BTW_REASONING_EFFORTS.map(value => ({ id: value, label: labels[value] }))}
    disabled={busy || !state.writable}
    onSelect={(value) => {
      const effort = value as BtwReasoningEffort
      setState(current => ({ ...current, status: 'saving', value: effort }))
      void save(effort).then(setState, () => {
        setState(current => ({ status: 'error', value: current.value, writable: true }))
      })
    }} />
}
