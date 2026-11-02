/** Persistent mode-scoped reminder controlled by the saved warning preference. @module */
import { useEffect } from 'react'
import { IconWarningOutlineRegular, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import type { SecurityProxyInjected } from './SecurityProxySection.tsx'
import css from './SecurityProxyBanner.module.css'

type Props = PropsRuntime<'conversation.mode.notice'> & PropsLocale<'settings.securityProxy'>
  & InjectFace<Pick<SecurityProxyInjected, 'hooks' | 'load' | 'configure'>>

/** @param props - Current mode and saved proxy state. @returns The warning while security mode has no dedicated proxy. */
export function SecurityProxyBanner({ modeId, useSecurityProxy, load, configure, t }: Props) {
  const view = useSecurityProxy(value => value)
  useEffect(() => { if (modeId === 'security') load() }, [modeId, load])
  const settings = view.state?.settings
  if (modeId !== 'security' || settings === undefined || settings.enabled || !settings.warnWhenDisabled) return null
  return <div className={css.banner} role="status">
    <IconWarningOutlineRegular size={18} className={css.icon} />
    <div className={css.copy}><span className={css.title}>{t('securityProxy.bannerTitle')}</span>
      <span className={css.hint}>{t(view.feedback?.code === 'saveFailed' ? 'securityProxy.saveFailed' : 'securityProxy.bannerHint')}</span></div>
    <label className={css.preference}><span>{t('securityProxy.bannerPreference')}</span>
      <Switch checked disabled={view.saving} label={t('securityProxy.bannerPreference')}
        onChange={() => { void configure({ warnWhenDisabled: false }) }} /></label>
  </div>
}
