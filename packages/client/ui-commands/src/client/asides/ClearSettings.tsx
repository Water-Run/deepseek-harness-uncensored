/** General Settings row for opt-in side context cleanup. */
import { useEffect, useState } from 'react'
import { PreferenceControlRow, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AsideClearSnapshot } from './clear-settings.ts'

/** Host preference operations supplied by the aside owner. */
export interface AsideClearInjected {
  readonly load: () => Promise<AsideClearSnapshot>
  readonly save: (value: boolean) => Promise<AsideClearSnapshot>
}

/** @param props - Localized setting and Host operations. @returns The shared switch row. */
export function AsideClearRow({ load, save, t }: PropsLocale<'command'> & InjectFace<AsideClearInjected>) {
  const [state, setState] = useState<AsideClearSnapshot>({ status: 'loading', value: false, writable: false })
  useEffect(() => {
    let active = true
    void load().then((value) => { if (active) setState(value) }, () => {
      if (active) setState({ status: 'unavailable', value: false, writable: false })
    })
    return () => { active = false }
  }, [load])
  return <PreferenceControlRow title={t('aside.clearOnClose')} description={t('aside.clearOnCloseDescription')}
    feedback={state.status === 'error' ? t('aside.clearSettingFailed') : state.status === 'unavailable' ? t('aside.reasoning.unavailable') : undefined}>
    <Switch label={t('aside.clearOnClose')} checked={state.value} busy={state.status === 'saving'}
      disabled={!state.writable || state.status === 'loading' || state.status === 'saving'}
      onChange={(value) => {
        setState(current => ({ ...current, status: 'saving' }))
        void save(value).then(setState, () => { setState(current => ({ ...current, status: 'error' })) })
      }} />
  </PreferenceControlRow>
}
