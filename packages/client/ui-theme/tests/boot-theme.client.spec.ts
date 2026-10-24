// @vitest-environment jsdom
/** The theme bootstrap injection row and the resulting pre-plugin browser theme. */
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootThemeInjections } from '../src/boot-theme.ts'
import type { FontSizes, ThemePreference } from '../src/theme-settings.ts'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function mockSystemDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches }) as MediaQueryList))
}

function executeBootstrap(preference?: ThemePreference, fontSizes?: FontSizes): void {
  for (const row of bootThemeInjections(preference, fontSizes)) {
    if (row.kind === 'script') runInNewContext(row.text, { document, matchMedia: globalThis.matchMedia })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.dsThemeSource
  document.body.removeAttribute(DARK_ATTRIBUTE)
  for (const name of ['--dsh-content-font-size', '--dsh-code-font-size', '--dsh-terminal-font-size']) document.body.style.removeProperty(name)
  for (const kind of ['text', 'code', 'terminal']) document.body.style.removeProperty(`--dsh-font-family-${kind}`)
})

describe('theme bootstrap row', () => {
  it('colors the body with head CSS before applying body state', () => {
    mockSystemDark(false)
    const [head, body] = bootThemeInjections('dark')
    expect(head).toMatchObject({ kind: 'style' })
    expect(body).toMatchObject({ kind: 'script', placement: 'body' })
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(':root{color-scheme:dark}body{background-color:#151517;--dsh-boot-bg:#151517}')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
    if (body?.kind !== 'script') throw new Error('theme body bootstrap row is not a script')
    runInNewContext(body.text, { document, matchMedia: globalThis.matchMedia })
    expect(document.documentElement.dataset.dsThemeSource).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('lets durable light override a dark OS and clears stale dark state', () => {
    document.body.setAttribute(DARK_ATTRIBUTE, '')
    mockSystemDark(true)
    const [head] = bootThemeInjections('light')
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(':root{color-scheme:light}body{background-color:#fff;--dsh-boot-bg:#fff}')
    executeBootstrap('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it.each([
    [true, true],
    [false, false],
  ] as const)('resolves system=%s for the body palette', (matches, dark) => {
    mockSystemDark(matches)
    executeBootstrap('system')
    expect(document.documentElement.dataset.dsThemeSource).toBe('system')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(dark)
  })

  it('uses a media query for the system canvas palette', () => {
    const [head] = bootThemeInjections('system')
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(
      ':root{color-scheme:light}body{background-color:#fff;--dsh-boot-bg:#fff}'
      + '@media(prefers-color-scheme:dark){:root{color-scheme:dark}body{background-color:#151517;--dsh-boot-bg:#151517}}',
    )
  })

  it('defaults to sunrise and sunset, which follows the system without a location, and falls back to light without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    executeBootstrap()
    expect(document.documentElement.dataset.dsThemeSource).toBe('system')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it.each([
    ['inside', [[-60_000, 60_000]], false, 'light'],
    ['outside', [[60_000, 120_000]], true, 'dark'],
  ] as const)('resolves sun with the render instant %s the daylight intervals', (_label, daylight, dark, source) => {
    mockSystemDark(!dark)
    const at = 0
    vi.spyOn(Date, 'now').mockReturnValue(at)
    const [head, body] = bootThemeInjections('sun', undefined, undefined, daylight, at)
    if (head?.kind !== 'style' || body?.kind !== 'script') throw new Error('unexpected theme bootstrap rows')
    expect(head.text).toContain(dark ? 'color-scheme:dark' : 'color-scheme:light')
    expect(head.text).not.toContain('@media')
    runInNewContext(body.text, { document, matchMedia: globalThis.matchMedia, Date })
    expect(document.documentElement.dataset.dsThemeSource).toBe(source)
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(dark)
  })

  it('writes the durable font sizes and their defaults', () => {
    mockSystemDark(false)
    executeBootstrap('light', { text: 22, code: 15, terminal: 18 })
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('22px')
    expect(document.body.style.getPropertyValue('--dsh-code-font-size')).toBe('15px')
    expect(document.body.style.getPropertyValue('--dsh-terminal-font-size')).toBe('18px')
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--dsh-content-font-size')).toBe('14px')
    expect(document.body.style.getPropertyValue('--dsh-code-font-size')).toBe('11px')
    expect(document.body.style.getPropertyValue('--dsh-terminal-font-size')).toBe('13px')
  })

  it('writes normalized durable font lists and leaves empty lists unset', () => {
    mockSystemDark(false)
    const [, body] = bootThemeInjections('light', undefined, { text: 'Inter', code: '', terminal: 'MesloLGS NF</script>, monospace' })
    if (body?.kind !== 'script') throw new Error('theme body bootstrap row is not a script')
    expect(body.text).not.toContain('<')
    runInNewContext(body.text, { document, matchMedia: globalThis.matchMedia })
    expect(document.body.style.getPropertyValue('--dsh-font-family-text')).toBe('"Inter"')
    expect(document.body.style.getPropertyValue('--dsh-font-family-code')).toBe('')
    expect(document.body.style.getPropertyValue('--dsh-font-family-terminal')).toBe('"MesloLGS NF/script", monospace')
  })
})
