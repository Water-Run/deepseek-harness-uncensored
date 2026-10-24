/**
 * Global theme DOM applier: projects the resolved ThemeSnapshot onto the
 * document — `html { color-scheme }` for native UA chrome (scrollbars, form
 * controls), `body[data-ds-dark-theme]` for the token palette, the active
 * theme's alias-token overrides as inline CSS variables on body, the content
 * font-size axis (`--dsh-content-font-size`), the code and terminal sizes
 * (`--dsh-code-font-size`, `--dsh-terminal-font-size`), the user font lists
 * (`--dsh-font-family-<role>`), `html[data-ds-theme-source]`
 * for native-chrome mirroring, and one presenter-owned
 * `meta[name="theme-color"]` for surrounding browser UI. Pure DOM writes, no
 * React involvement; the presenter only ever retracts what it wrote itself,
 * so foreign attributes, metadata, and inline styles survive. A light/dark
 * change after the first apply runs inside a view transition: a circle spreads
 * from a pointer press made within the last two seconds, otherwise the palettes
 * cross-fade. Reduced motion and engines without view transitions switch at once.
 */
import type { FontRole, ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Body attribute selecting the dark base palette in the token stylesheets. */
export const DARK_ATTRIBUTE = 'data-ds-dark-theme'

/**
 * Root attribute publishing the theme source (`light`, `dark`, or `system`)
 * for host shells that mirror it into the native theme (the Electron preload
 * forwards it to `nativeTheme.themeSource`, so native chrome, renderer
 * `prefers-color-scheme` queries, and Platform login links follow the app
 * palette on every platform). `system` only while the palette follows the
 * operating system: the `system` preference, or `sun` without a location
 * estimate; any other preference (including registered theme ids) publishes
 * its resolved scheme.
 */
export const THEME_SOURCE_ATTRIBUTE = 'data-ds-theme-source'

/** Body variable carrying the user's content font size in px. */
export const CONTENT_FONT_SIZE_VARIABLE = '--dsh-content-font-size'

/** Body variables carrying the user's font sizes in px by role. */
const FONT_SIZE_VARIABLES = {
  text: CONTENT_FONT_SIZE_VARIABLE,
  code: '--dsh-code-font-size',
  terminal: '--dsh-terminal-font-size',
} as const satisfies Record<FontRole, string>

/** Body variables carrying the user's normalized font lists; absent selects the built-in stack. */
const FONT_FAMILY_VARIABLES = {
  text: '--dsh-font-family-text',
  code: '--dsh-font-family-code',
  terminal: '--dsh-font-family-terminal',
} as const satisfies Record<FontRole, string>

/** Root attribute marking a running light/dark view transition: `circle` or `fade`. */
export const THEME_REVEAL_ATTRIBUTE = 'data-dsh-theme-reveal'

/** A pointer press this recent places the circle's center; an older one cross-fades instead. */
const POINTER_ORIGIN_MS = 2000

/** Applies theme snapshots to the document; one instance per plugin fiber. */
export class ThemePresenter {
  /** Token names this presenter wrote in the last apply (its retraction set). */
  private appliedTokens: string[] = []
  /** The single metadata node this presenter inserts and removes. */
  private readonly themeColorMeta: HTMLMetaElement
  /** Scheme written by the last apply; undefined before the first. */
  private scheme: 'light' | 'dark' | undefined
  private pointer: { x: number; y: number; at: number } | undefined
  private reveal: ViewTransition | undefined
  private revision = 0
  private readonly press = (event: PointerEvent): void => {
    this.pointer = { x: event.clientX, y: event.clientY, at: performance.now() }
  }

  /** Create the presenter-owned metadata node before the first snapshot arrives. */
  constructor() {
    this.themeColorMeta = document.createElement('meta')
    this.themeColorMeta.name = 'theme-color'
    document.addEventListener('pointerdown', this.press, { capture: true, passive: true })
  }

  /**
   * Project a snapshot onto the document: set root `color-scheme` and the body
   * palette attribute from `active.colorScheme` (never the id — `system` is
   * resolved upstream), publish the font sizes and font lists, then replace the
   * previously applied token variables with `active.tokens`. Browser
   * theme-color metadata follows the computed body background after those
   * writes, so the rendered palette remains the color authority.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot: ThemeSnapshot): void {
    const current = ++this.revision
    this.reveal?.skipTransition()
    this.reveal = undefined
    this.clearReveal()
    const previous = this.scheme
    const scheme = snapshot.active.colorScheme
    this.scheme = scheme
    if (previous === undefined || previous === scheme || typeof document.startViewTransition !== 'function'
      || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      this.write(snapshot)
      return
    }
    const root = document.documentElement
    const pointer = this.pointer !== undefined && performance.now() - this.pointer.at < POINTER_ORIGIN_MS ? this.pointer : undefined
    this.pointer = undefined
    if (pointer === undefined) root.setAttribute(THEME_REVEAL_ATTRIBUTE, 'fade')
    else {
      const radius = Math.hypot(Math.max(pointer.x, innerWidth - pointer.x), Math.max(pointer.y, innerHeight - pointer.y))
      root.setAttribute(THEME_REVEAL_ATTRIBUTE, 'circle')
      root.style.setProperty('--dsh-theme-reveal-x', `${String(pointer.x)}px`)
      root.style.setProperty('--dsh-theme-reveal-y', `${String(pointer.y)}px`)
      root.style.setProperty('--dsh-theme-reveal-radius', `${String(Math.ceil(radius))}px`)
    }
    const transition = document.startViewTransition(() => { if (this.revision === current) this.write(snapshot) })
    this.reveal = transition
    // A skipped transition can finish after its replacement has started.
    void transition.finished.catch(() => undefined).finally(() => {
      if (this.reveal !== transition) return
      this.reveal = undefined
      this.clearReveal()
    })
  }

  private clearReveal(): void {
    const root = document.documentElement
    root.removeAttribute(THEME_REVEAL_ATTRIBUTE)
    for (const name of ['--dsh-theme-reveal-x', '--dsh-theme-reveal-y', '--dsh-theme-reveal-radius']) root.style.removeProperty(name)
  }

  private write(snapshot: ThemeSnapshot): void {
    const scheme = snapshot.active.colorScheme
    const followsSystem = snapshot.preference === 'system' || (snapshot.preference === 'sun' && snapshot.sun === undefined)
    document.documentElement.style.colorScheme = scheme
    document.documentElement.setAttribute(THEME_SOURCE_ATTRIBUTE, followsSystem ? 'system' : scheme)
    const body = document.body
    if (scheme === 'dark') body.setAttribute(DARK_ATTRIBUTE, '')
    else body.removeAttribute(DARK_ATTRIBUTE)
    for (const [role, name] of Object.entries(FONT_SIZE_VARIABLES)) {
      body.style.setProperty(name, `${snapshot.fontSizes[role as FontRole]}px`)
    }
    for (const [kind, name] of Object.entries(FONT_FAMILY_VARIABLES)) {
      const list = snapshot.fontFamilies[kind as FontRole]
      if (list === '') body.style.removeProperty(name)
      else body.style.setProperty(name, list)
    }
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value)
      this.appliedTokens.push(name)
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor
    if (!this.themeColorMeta.isConnected) document.head.append(this.themeColorMeta)
  }

  /**
   * Retract root color-scheme, the theme-source attribute, the palette
   * attribute, token variables, the font sizes, font lists, the owned metadata node,
   * and any running light/dark transition.
   */
  dispose(): void {
    this.revision += 1
    document.removeEventListener('pointerdown', this.press, { capture: true })
    this.reveal?.skipTransition()
    this.reveal = undefined
    this.clearReveal()
    document.documentElement.style.removeProperty('color-scheme')
    document.documentElement.removeAttribute(THEME_SOURCE_ATTRIBUTE)
    const body = document.body
    body.removeAttribute(DARK_ATTRIBUTE)
    for (const name of Object.values(FONT_SIZE_VARIABLES)) body.style.removeProperty(name)
    for (const name of Object.values(FONT_FAMILY_VARIABLES)) body.style.removeProperty(name)
    for (const name of this.appliedTokens) body.style.removeProperty(name)
    this.appliedTokens = []
    this.themeColorMeta.remove()
  }
}
