/**
 * Brand identity of the shipped desktop application.
 *
 * The installer, window icons, welcome artwork and in-app wordmark are DSHU artwork, not the
 * upstream DeepSeek Harness artwork. A candidate assembled from upstream sources silently
 * reverted all of them once, so this suite pins the reviewed bytes and the product naming that
 * the packaging pipeline and the client bundle read.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktop = join(import.meta.dirname, '..')
const root = join(desktop, '..', '..')

/** Reviewed brand artwork, pinned by SHA-256. Replace a hash only with a reviewed redesign. */
const BRAND_ARTWORK: Readonly<Record<string, string>> = {
  'apps/desktop/resources/icon.svg': '910fc6c321e17f888530ea1a10ef76d09445e78e7a7f1e60bf00aea39efc6da3',
  'apps/desktop/resources/icon.png': '0641756b013b6a12a5367da29af702b0857cb345b1832e98c7447dfc48470067',
  'apps/desktop/resources/icon-windows.png': '0641756b013b6a12a5367da29af702b0857cb345b1832e98c7447dfc48470067',
  'apps/desktop/resources/icon-windows.ico': '3ec1d4992b144d64b9438d33b2f2722b5f4f7926d962fc8d400b87ba409b0012',
  'apps/desktop/resources/icon-macos.png': '0641756b013b6a12a5367da29af702b0857cb345b1832e98c7447dfc48470067',
  'apps/desktop/resources/tray-windows.ico': '27e57d2d3c4ca1c60728a7beaaaa662889394e4aec996aa7e2854bd1f29d6132',
  'apps/desktop/installer/assets/brand.png': 'c698b182ed5979a2c6c70ebdfcc9d9d5fb73fb45b988a4919f214db0d9c6e4db',
  'apps/desktop/installer/assets/brand-dark.png': '0a1aec982bf79fdc43b4545606a5df85b7907cf9345be99435c04e4227692714',
  'apps/desktop/installer/assets/brand-2x.png': 'c4b78d153e3722877f124260edf564f98a937fab659c4dc356e531ec1c3ee2f6',
  'apps/desktop/installer/assets/brand-dark-2x.png': '3cffb17d797ebb7d15ce4ecc9d5af5a281841f42add1982bb1658fd573a4aeaf',
  'apps/desktop/installer/assets/uninstaller-sidebar.png': '20bea1f1a3d556a5c58b873d6aa1bbfde5ecf89ce5d6da16b71634c0d79423a7',
  'apps/desktop/renderer/assets/welcome-brand.svg': 'd0a8c5d9abc0a4278dd220f64e3dcc47fef203c330b8db3ac57aa76c3ae49726',
  'apps/web/public/apple-touch-icon.png': '48da1ecb7b761fe74555377a24fdefedef0b54f6b980500cc604a6253fc300d4',
  'apps/web/public/favicon.svg': '910fc6c321e17f888530ea1a10ef76d09445e78e7a7f1e60bf00aea39efc6da3',
  'apps/web/public/favicon-dark.svg': '910fc6c321e17f888530ea1a10ef76d09445e78e7a7f1e60bf00aea39efc6da3',
  'apps/web/public/icon-192.png': '9449db15ff78ea13f133b2c947c878dccb73586381f76345a95f31d2c2b429ef',
  'apps/web/public/icon-512.png': '8c024021af51165c10fc4612d1238508fb406b483f4abfd63a3e6768434d4c9a',
  'apps/web/public/icon-maskable-512.png': '908bfb2fdc4957175ee6e2b4fa9553b37df319ebc8871a91ce79dcb8666e39ac',
  'apps/web/public/manifest.webmanifest': '084e5d06d162b4afb74b23c608fbca9ded917ed288d0939c39a322c53a3a1a2c',
}

/** Installer and desktop strings that name the product, and the languages that must say so. */
const PRODUCT_STRING_KEYS = [
  'hideApplication',
  'quitApplication',
  'openApplication',
  'quitTitle',
  'welcomeTitle',
  'welcomeBrand',
  'updateTitle',
] as const

/** Read a repository file as text. */
function text(relative: string): string {
  return readFileSync(join(root, relative), 'utf8')
}

/** Read one PNG's IHDR dimensions. */
function pngSize(relative: string): { width: number; height: number } {
  const bytes = readFileSync(join(root, relative))
  expect(bytes.subarray(1, 4).toString('latin1'), `${relative} is a PNG`).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('brand artwork', () => {
  it('ships the reviewed DSHU artwork instead of upstream DeepSeek Harness artwork', () => {
    for (const [relative, want] of Object.entries({ ...BRAND_ARTWORK })) {
      const bytes = readFileSync(join(root, relative))
      const actual = createHash('sha256').update(bytes).digest('hex')
      expect(actual, relative).toBe(want)
    }
  })

  it('ships installer wordmarks at the reviewed size', () => {
    expect(pngSize('apps/desktop/installer/assets/brand.png')).toEqual({ width: 600, height: 196 })
    expect(pngSize('apps/desktop/installer/assets/brand-dark.png')).toEqual({ width: 600, height: 196 })
    expect(pngSize('apps/desktop/installer/assets/brand-2x.png')).toEqual({ width: 1200, height: 392 })
    expect(pngSize('apps/desktop/installer/assets/brand-dark-2x.png')).toEqual({ width: 1200, height: 392 })
  })

  it('marks the welcome wordmark with the DSHU release pill', () => {
    expect(text('apps/desktop/renderer/assets/welcome-brand.svg')).toContain('uncensored-pill')
  })

  it('draws the in-app wordmark with the UNCENSORED pill', () => {
    const wordmark = text('packages/client/ui-primitives/src/BrandWordmark.tsx')
    expect(wordmark).toContain('UNCENSORED_PATH')
    expect(wordmark).toMatch(/d=\{UNCENSORED_PATH\}/u)
  })
})

describe('product naming', () => {
  it('names DSHU, not upstream DeepSeek Harness, in every installer locale', () => {
    const locales = statSync(join(root, 'apps/desktop/installer/locales')).isDirectory()
    expect(locales).toBe(true)
    for (const name of ['de_DE', 'en_US', 'es_ES', 'fr_FR', 'ja_JP', 'pt_BR', 'ru_RU', 'zh_CN']) {
      const copy = text(`apps/desktop/installer/locales/${name}.json`)
      expect(copy.match(/DeepSeek Harness(?! Uncensored)/gu) ?? [], name).toEqual([])
    }
  })

  it('names DSHU in the desktop menu, welcome and update copy', () => {
    const copy = text('apps/desktop/src/locale.ts')
    for (const key of PRODUCT_STRING_KEYS) {
      const matches = [...copy.matchAll(new RegExp(`^\\s*${key}: '([^']*)',$`, 'gmu'))]
      expect(matches.length, key).toBeGreaterThanOrEqual(2)
      for (const match of matches) expect(match[1], `${key}: ${match[1]}`).toContain('Uncensored')
    }
  })

  it('titles the web shell and its installable manifest as DSHU', () => {
    expect(text('apps/web/index.html')).toContain('<title>DeepSeek Harness Uncensored</title>')
    expect(text('apps/web/index.html')).toContain('content="DSHU"')
    const manifest = JSON.parse(text('apps/web/public/manifest.webmanifest')) as { name?: string; short_name?: string }
    expect(manifest.name).toBe('DeepSeek Harness Uncensored')
    expect(manifest.short_name).toBe('DSHU')
  })

  it('keeps the artwork generator that recreates the web shell icons', () => {
    expect(statSync(join(root, 'apps/desktop/scripts/render-uncensored-artwork.ts')).size).toBeGreaterThan(0)
  })
})
