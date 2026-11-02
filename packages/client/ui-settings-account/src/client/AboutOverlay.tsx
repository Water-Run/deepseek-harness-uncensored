/** Frame-owned About dialog shared by product entry points. @module */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AboutController } from './about-controller.ts'
import { AboutDialog } from './AboutDialog.tsx'

/** State and dismissal supplied by the feature owner. */
export interface AboutOverlayInjected { hooks: { about: AboutController['state'] }; close: () => void }

/** @param props - Root-owned dialog state and labels. @returns The common About page when requested. */
export function AboutOverlay({ useAbout, close, t }: PropsRuntime<'shell.overlay'> & PropsLocale<'settings.account'>
  & InjectFace<AboutOverlayInjected>) {
  const open = useAbout(value => value)
  return <AboutDialog open={open} t={t} close={close} />
}
