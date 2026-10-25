/** General setting for input predictions across main and aside composers. */
import { PreferenceControlRow, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PredictionPreference } from '../prediction-preference.ts'

/** Preference reader and local persistence operation. */
export interface PredictionRowInjected {
  hooks: { predictionPreference: PredictionPreference['state'] }
  setPredictionEnabled(enabled: boolean): void
}

/** @param props - Shared preference and localized copy. @returns The General Settings switch. */
export function PredictionRow({ usePredictionPreference, setPredictionEnabled, t }:
PropsRuntime<'settings.general.item'> & PropsLocale<'conversation'> & InjectFace<PredictionRowInjected>) {
  const state = usePredictionPreference(value => value)
  return <PreferenceControlRow title={t('settings.prediction.title')} description={t('settings.prediction.description')}
    feedback={state.failed ? t('settings.prediction.failed') : undefined}>
    <Switch label={t('settings.prediction.title')} checked={state.enabled} onChange={setPredictionEnabled} />
  </PreferenceControlRow>
}
