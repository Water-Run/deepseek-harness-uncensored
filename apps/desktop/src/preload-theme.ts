/** Mirrors the Web UI's theme source into Electron's native theme so native chrome and Platform login pages follow the app palette. */

import { ipcRenderer } from 'electron'
import { DESKTOP_IPC } from './ipc.ts'

/** Root attribute written by the Web UI's theme bootstrap and presenter (ui-theme / ui-layout). */
const THEME_SOURCE_ATTRIBUTE = 'data-ds-theme-source'

/** Root attribute marking a running light/dark view transition (ui-layout's theme presenter). */
const THEME_REVEAL_ATTRIBUTE = 'data-dsh-theme-reveal'

/**
 * Watches `html[data-ds-theme-source]` and forwards each value to the main
 * process, which sets `nativeTheme.themeSource`. Native chrome and renderer
 * `prefers-color-scheme` queries on every platform then follow the app's
 * theme preference instead of the OS appearance while `system` keeps
 * following the OS; the macOS sidebar vibrancy material is one such consumer.
 * The main process reads the same value back as `shouldUseDarkColors` when a
 * Platform login link needs the resolved palette.
 *
 * A light/dark change runs inside a view transition: the page repaints itself
 * over the reveal, while the native title bar cannot animate at all. Forwarding
 * the new source at the start of the transition therefore repaints the window
 * buttons ahead of the content. The forward waits for the reveal to end, so
 * the native chrome changes together with the palette it now matches.
 */
export function syncNativeTheme(): void {
  let sent: string | undefined
  let pending: string | undefined
  const send = (): void => {
    const value = document.documentElement.getAttribute(THEME_SOURCE_ATTRIBUTE)
    if (value !== null) pending = value
    if (document.documentElement.hasAttribute(THEME_REVEAL_ATTRIBUTE)) return
    if (pending === undefined || pending === sent) return
    sent = pending
    ipcRenderer.send(DESKTOP_IPC.nativeThemeSet, pending)
  }
  const observe = (): void => {
    new MutationObserver(send).observe(document.documentElement, {
      attributeFilter: [THEME_SOURCE_ATTRIBUTE, THEME_REVEAL_ATTRIBUTE],
    })
    send()
  }
  // The preload runs before the document root exists; the theme bootstrap
  // script writes the attribute before DOMContentLoaded.
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', observe, { once: true })
  else observe()
}
