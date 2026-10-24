/**
 * Theme bootstrap row for the browser's pre-plugin interval. Each index
 * render embeds the current durable built-in preference, font sizes, and
 * font-family lists. Head CSS colors the document canvas before script
 * execution; the body script installs the palette selector and font variables
 * that the client presenters adopt. The `sun` preference embeds the daylight
 * intervals the Host estimated for its location; without them it behaves as
 * `system` until the client runtime resolves its own location.
 */

import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import {
  DEFAULT_FONT_SIZES, DEFAULT_PREFERENCE, FONT_ROLES, FONT_SIZE_SPECS, fontFamilyVariable, normalizeFontFamily,
  type FontFamilies, type FontSizes, type ThemePreference,
} from './theme-settings.ts'

const LIGHT_BACKGROUND = '#fff'
const DARK_BACKGROUND = '#151517'

/** Daylight intervals, half-open epoch-millisecond `[sunrise, sunset)` pairs, around the render instant. */
export type BootDaylight = readonly (readonly [number, number])[]

function inDaylight(daylight: BootDaylight, at: number): boolean {
  return daylight.some(([start, end]) => start <= at && at < end)
}

/** CSS that colors the document canvas before any script executes. */
function bootThemeStyle(preference: ThemePreference, daylight: BootDaylight | undefined, at: number): string {
  const light = `:root{color-scheme:light}body{background-color:${LIGHT_BACKGROUND};--dsh-boot-bg:${LIGHT_BACKGROUND}}`
  const dark = `:root{color-scheme:dark}body{background-color:${DARK_BACKGROUND};--dsh-boot-bg:${DARK_BACKGROUND}}`
  if (preference === 'light') return light
  if (preference === 'dark') return dark
  if (preference === 'sun' && daylight !== undefined) return inDaylight(daylight, at) ? light : dark
  return `${light}@media(prefers-color-scheme:dark){${dark}}`
}

/** Build the body script that installs the palette selector and font variables. */
function bootThemeBodyScript(
  preference: ThemePreference, fontSizes: FontSizes, fontFamilies: FontFamilies, daylight: BootDaylight | undefined,
): string {
  const sizes = FONT_ROLES.map(role =>
    `\n  document.body.style.setProperty(${JSON.stringify(FONT_SIZE_SPECS[role].variable)}, ${JSON.stringify(`${fontSizes[role]}px`)})`).join('')
  const families = FONT_ROLES.flatMap((kind) => {
    const list = normalizeFontFamily(fontFamilies[kind])
    return list === '' ? [] : [`\n  document.body.style.setProperty(${JSON.stringify(fontFamilyVariable(kind))}, ${JSON.stringify(list)})`]
  }).join('')
  return `(() => {
  const preference = ${JSON.stringify(preference)}
  const daylight = ${JSON.stringify(preference === 'sun' ? daylight ?? null : null)}
  const follows = preference === 'system' || (preference === 'sun' && daylight === null)
  const now = Date.now()
  const systemDark = follows
    && typeof matchMedia !== 'undefined'
    && matchMedia('(prefers-color-scheme: dark)').matches
  const sunDark = !follows && preference === 'sun' && !daylight.some(([start, end]) => now >= start && end > now)
  const dark = preference === 'dark' || systemDark || sunDark
  document.documentElement.dataset.dsThemeSource = follows ? 'system' : preference === 'sun' ? (dark ? 'dark' : 'light') : preference
  document.body.toggleAttribute('data-ds-dark-theme', dark)${sizes}${families}
})()`
}

/**
 * Theme bootstrap rows: head CSS colors the document canvas before
 * first paint, then the body script installs the palette selector and font
 * size and font families before the shell mount and module script.
 * @param preference - Current Host-backed built-in preference.
 * @param fontSizes - Current Host-backed font sizes in px by role.
 * @param fontFamilies - Current Host-backed font lists; each is normalized before embedding.
 * @param daylight - Daylight intervals around `at` for the `sun` preference; absent when no location resolved.
 * @param at - Render instant the head CSS classifies.
 * @returns head and body script rows in execution order.
 */
export function bootThemeInjections(
  preference: ThemePreference = DEFAULT_PREFERENCE,
  fontSizes: FontSizes = DEFAULT_FONT_SIZES,
  fontFamilies: FontFamilies = { text: '', code: '', terminal: '' },
  daylight?: BootDaylight,
  at: number = Date.now(),
): IndexInjection[] {
  return [
    { kind: 'style', text: bootThemeStyle(preference, daylight, at) },
    { kind: 'script', placement: 'body', text: bootThemeBodyScript(preference, fontSizes, fontFamilies, daylight) },
  ]
}
