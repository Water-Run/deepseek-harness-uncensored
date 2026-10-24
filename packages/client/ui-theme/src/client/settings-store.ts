/**
 * Appearance and font row slot stores: mirrors of the theme service
 * snapshot. The plugin's apply-world change listener is the only writer; the
 * row components read via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import {
  DEFAULT_FONT_SIZES, DEFAULT_PREFERENCE, DEFAULT_SUN_LOCATION,
  type FontFamilies, type FontSizes, type ThemePreference,
} from '../theme-settings.ts'
import type { SunLocation } from '../sun.ts'
import type { SunEstimate } from './index.ts'

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted preference (selection state reads this, never the resolved active theme). */
  preference: ThemePreference
  /** Persisted location of the `sun` preference. */
  sunLocation: SunLocation
  /** Current estimate of the `sun` preference; absent for other preferences or an unmatched time zone. */
  sun: SunEstimate | undefined
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Theme snapshot fields the Appearance row mirrors. */
export interface AppearanceRowSnapshot {
  preference: ThemePreference
  sunLocation: SunLocation
  sun?: SunEstimate
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, snapshot: AppearanceRowSnapshot) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ preference: DEFAULT_PREFERENCE, sunLocation: DEFAULT_SUN_LOCATION, sun: undefined, revision: -1 }),
    actions: {
      sync: (d, snapshot: AppearanceRowSnapshot) => {
        if (snapshot.revision <= d.revision) return
        d.preference = snapshot.preference
        d.sunLocation = snapshot.sunLocation
        d.sun = snapshot.sun
        d.revision = snapshot.revision
      },
    },
  })
}

/** Store state mirrored from the theme snapshot's fonts (shared by the font-size row and the font settings group). */
export interface FontRowState {
  /** Persisted font sizes in px by role. */
  fontSizes: FontSizes
  /** Persisted normalized font lists by role. */
  fontFamilies: FontFamilies
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type FontRowActions = {
  sync: (draft: FontRowState, fontSizes: FontSizes, fontFamilies: FontFamilies, revision: number) => void
}

/**
 * Declares the font rows' state and write surface.
 * @returns the store handle.
 */
export function createFontRowStore(): EngineStoreHandle<FontRowState, FontRowActions> {
  return defineStore({
    init: (): FontRowState => ({ fontSizes: DEFAULT_FONT_SIZES, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1 }),
    actions: {
      sync: (d, fontSizes: FontSizes, fontFamilies: FontFamilies, revision: number) => {
        if (revision <= d.revision) return
        d.fontSizes = fontSizes
        d.fontFamilies = fontFamilies
        d.revision = revision
      },
    },
  })
}
