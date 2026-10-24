/**
 * Appearance preference row registered into the General section item slot:
 * title, description, and four preview cards (sunrise and sunset, system,
 * light, dark), each a miniature of the palettes it can show. The `sun` card
 * adds its location picker and the current estimate. Selection follows the
 * persisted preference, never the resolved active theme.
 */
import clsx from 'clsx'
import { Select } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemePreference } from '../theme-settings.ts'
import { SUN_CITIES, SUN_LOCATION_AUTO, type SunLocation } from '../sun.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference writes (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Choose the location of the `sun` preference. */
  setSunLocation: (location: SunLocation) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Card order with the palettes each preview shows: one palette, or light beside dark. */
const CARDS: readonly { id: ThemePreference; title: ThemeKey; caption: ThemeKey; preview: 'split' | 'light' | 'dark' }[] = [
  { id: 'sun', title: 'appearance.sun', caption: 'appearance.sun.caption', preview: 'split' },
  { id: 'system', title: 'appearance.system', caption: 'appearance.system.caption', preview: 'split' },
  { id: 'light', title: 'appearance.light', caption: 'appearance.light.caption', preview: 'light' },
  { id: 'dark', title: 'appearance.dark', caption: 'appearance.dark.caption', preview: 'dark' },
]

function PreviewPane({ scheme }: { scheme: 'light' | 'dark' }) {
  return (
    <span className={css.pane} data-scheme={scheme}>
      <span className={css.paneBar}><span className={css.paneAccent} /></span>
      <span className={css.paneBody} />
    </span>
  )
}

const formatTime = (at: number): string => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(at)

function SunDetails({ t, useStore, setSunLocation }: Pick<AppearanceRowComponentProps, 't' | 'useStore' | 'setSunLocation'>) {
  const location = useStore(s => s.sunLocation)
  const sun = useStore(s => s.sun)
  const cityName = (id: string): string => t(`sun.city.${id}` as ThemeKey)
  const estimate = sun === undefined ? t('sun.unresolved')
    : t(`sun.estimate.${sun.source}`, { city: cityName(sun.cityId) })
  const times = sun === undefined ? undefined : sun.interval === undefined ? t('sun.noDaylight')
    : t('sun.times', { sunrise: formatTime(sun.interval[0]), sunset: formatTime(sun.interval[1]) })
  return (
    <div className={css.sun}>
      <label className={css.sunField}>
        <span className={css.sunLabel}>{t('sun.location')}</span>
        <Select
          className={css.select}
          label={t('sun.location')}
          value={location}
          onChange={setSunLocation}
          options={[{ value: SUN_LOCATION_AUTO, label: t('sun.auto') },
            ...SUN_CITIES.map(city => ({ value: city.id, label: cityName(city.id) }))]}
        />
      </label>
      <p className={css.sunEstimate} aria-live="polite">
        {estimate}
        {times === undefined ? null : <span className={css.sunTimes}>{times}</span>}
      </p>
      <p className={css.sunNote}>{t('sun.note')}</p>
    </div>
  )
}

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setSunLocation, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <p className={css.description}>{t('appearance.description')}</p>
      <div className={css.cards} role="radiogroup" aria-label={t('appearance.title')}>
        {CARDS.map(({ id, title, caption, preview }) => {
          const selected = preference === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={clsx(css.card, selected && css.selected)}
              data-theme-card={id}
              onClick={() => { setTheme(id) }}
            >
              <span className={css.preview} aria-hidden="true">
                {preview === 'split'
                  ? <><PreviewPane scheme="light" /><PreviewPane scheme="dark" /></>
                  : <><PreviewPane scheme={preview} /><PreviewPane scheme={preview} /></>}
              </span>
              <span className={css.footer}>
                <span className={css.radio} aria-hidden="true" />
                <span className={css.text}>
                  <span className={css.cardTitle}>{t(title)}</span>
                  <span className={css.caption}>{t(caption)}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {preference === 'sun' ? <SunDetails t={t} useStore={useStore} setSunLocation={setSunLocation} /> : null}
    </div>
  )
}
