import { SHIPPED_LOCALE_IDS } from '../../../scripts/shipped-locales.ts'
import { createRequire } from 'node:module'
/** Per-language installer resources feed both the packaging language list and the NSIS compiler. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { readInstallerLocales, renderInstallerStrings } from '../scripts/installer-locales.mjs'

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-installer-locales-'))
  onTestFinished(() => { rmSync(directory, { recursive: true, force: true }) })
  for (const id of ['en_US', 'zh_CN', 'ja_JP', 'es_ES', 'fr_FR', 'de_DE', 'ru_RU', 'pt_BR']) {
    writeFileSync(join(directory, `${id}.json`), readFileSync(new URL(`../installer/locales/${id}.json`, import.meta.url)))
  }
  return directory
}

it('generates the two DSHU languages from the resources that select packaged languages', () => {
  const locales = readInstallerLocales()
  expect(locales.map(locale => locale.id)).toEqual(['en_US', 'zh_CN'])
  const source = renderInstallerStrings(locales)
  expect(source).not.toContain('${LANG_JAPANESE}')
  expect(source).toContain('!ifdef LANG_SIMPCHINESE\n')
  expect(source.match(/^LangString INSTALLER_UPDATE_WAIT /gmu)).toHaveLength(2)
  expect(source.match(/^LangString /gmu)).toHaveLength(76)
  expect(source).toContain('LangString INSTALLER_DOWNGRADE ${LANG_ENGLISH}')
  expect(source).toContain('LangString INSTALLER_VERSION_UNKNOWN ${LANG_SIMPCHINESE}')
  expect(source).toContain('LangString INSTALLER_PRODUCT_TITLE ${LANG_ENGLISH} "DSHU — ${PRODUCT_NAME}"')
  expect(source).toContain('LangString INSTALLER_IDENTITY ${LANG_SIMPCHINESE} "独立安装，可与官方版 DeepSeek Harness 并存"')
  const chinese = locales.filter(locale => locale.id === 'zh_CN')
  expect(renderInstallerStrings(chinese)).not.toContain('${LANG_ENGLISH}')
})

it.each(['en_US', 'zh_CN'])('rejects a missing %s configuration', (id) => {
  const directory = fixture()
  rmSync(join(directory, `${id}.json`))
  expect(() => readInstallerLocales(directory)).toThrow(`missing ${id}.json`)
})

it.each([
  ['missing key', (resource: ReturnType<typeof readInstallerLocales>[number]) => { delete resource.strings.INSTALLER_INSTALL }, 'keys differ'],
  ['extra key', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_EXTRA = 'extra' }, 'keys differ'],
  ['empty text', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_INSTALL = '' }, 'nonempty text'],
  ['changed placeholder', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_NATIVE_PROGRESS = '%s%%' }, 'format placeholders'],
  ['missing percent escape', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_NATIVE_PROGRESS = '%d%' }, 'format placeholders'],
  ['extra format specifier', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_NATIVE_PROGRESS = '%d%% %q' }, 'format placeholders'],
  ['translated command', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_THEME_ERROR = 'Use /THEME=claro.' }, 'format placeholders'],
  ['missing product name', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_PRODUCT_TITLE = 'DSHU' }, 'format placeholders'],
  ['duplicate language', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.nsisLanguage = 'ENGLISH' }, 'duplicate NSIS language'],
  ['invisible character', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_INSTALL = 'Install\u200b' }, 'invisible'],
  ['byte-order mark', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.strings.INSTALLER_INSTALL = 'Install\ufeff' }, 'invisible'],
  ['invalid compiler token', (resource: ReturnType<typeof readInstallerLocales>[number]) => { resource.nsisLanguage = 'JA\n!error' }, 'invalid NSIS language'],
])('rejects %s', (_name, mutate, diagnostic) => {
  const directory = fixture()
  const resource = readInstallerLocales(directory).find(locale => locale.id === 'zh_CN')!
  mutate(resource)
  writeFileSync(join(directory, 'zh_CN.json'), JSON.stringify(resource))
  expect(() => readInstallerLocales(directory)).toThrow(diagnostic)
})

it('escapes literal NSIS syntax without changing translated text', () => {
  const locale = readInstallerLocales()[0]!
  expect(renderInstallerStrings([{ ...locale, strings: { INSTALLER_INSTALL: '"$name"\nnext\rline' } }]))
    .toContain('"$\\"$$name$\\"$\\nnext$\\rline"')
})

it('uses the real electron-builder language identifiers and English fallback', () => {
  const require = createRequire(import.meta.url)
  const { LangConfigurator, createAddLangsMacro } = require('app-builder-lib/out/targets/nsis/nsisLang.js') as {
    LangConfigurator: new (options: { installerLanguages: string[] }) => object
    createAddLangsMacro: (generator: { macro: (name: string, lines: string[]) => void }, languages: object) => void
  }
  const locales = readInstallerLocales()
  expect(locales[0]?.id).toBe('en_US')
  expect(locales.map(locale => locale.id.split('_')[0]).sort()).toEqual([...SHIPPED_LOCALE_IDS].sort())
  createAddLangsMacro({ macro: (_name, lines) => {
    expect(lines.map(line => /MUI_LANGUAGE "([^" ]+)"/u.exec(line)?.[1]?.toUpperCase()))
      .toEqual(locales.map(locale => locale.nsisLanguage))
  } }, new LangConfigurator({ installerLanguages: locales.map(locale => locale.id) }))
})
