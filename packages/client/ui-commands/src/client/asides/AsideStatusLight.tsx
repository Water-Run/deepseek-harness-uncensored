/** Side-conversation work light shown before the header's side-question launcher. */
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AsideStatusLight.module.css'

/** Working state the light reports. */
export interface AsideStatusLightProps {
  /** Whether the side conversation is working right now. */
  readonly running: boolean
  /** Localized state description, shown in the hover hint. */
  readonly label: string
}

/**
 * Render the side conversation's status beside its launcher.
 * @param props - Working state and its localized description.
 * @returns A breathing light, blinking while the side conversation works. The
 * dot is decorative chrome, so assistive technology skips it; the hover hint
 * carries the same state in words.
 */
export function AsideStatusLight({ running, label }: AsideStatusLightProps) {
  return (
    <Tooltip label={label} side="bottom" portal>
      <span
        className={clsx(css.light, running ? css.running : css.idle)}
        aria-hidden="true"
        data-aside-status={running ? 'running' : 'stopped'}
      />
    </Tooltip>
  )
}
