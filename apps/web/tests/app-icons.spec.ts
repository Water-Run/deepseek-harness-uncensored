/** Committed install icon dimensions and the generator's SVG crop and safe-zone scale. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  APP_ICON_VARIANTS, ICON_OUTPUT_DIRECTORY, MASKABLE_ARTWORK_SCALE, TILE_SOURCE,
  maskableDocument, tileDocument,
} from '../scripts/render-app-icons.ts'
import { pngSize } from './png-size.ts'

describe('web install icons', () => {
  it('ships every declared variant at its declared edge', async () => {
    for (const variant of APP_ICON_VARIANTS) {
      expect(pngSize(await readFile(join(ICON_OUTPUT_DIRECTORY, variant.file))))
        .toEqual([variant.size, variant.size])
    }
  })

  it('preserves the DSHU tile and gives only the maskable variant full-bleed background and inset artwork', async () => {
    const source = await readFile(TILE_SOURCE, 'utf8')
    const tile = tileDocument(source)
    const maskable = maskableDocument(source)
    expect(tile).toContain('viewBox="0 0 1024 1024"')
    expect(tile).toContain('rx="224"')
    expect(tile).not.toContain(`scale(${MASKABLE_ARTWORK_SCALE})`)
    expect(tile).toContain('<g id="tray-glyph">')
    expect(tile).toContain(source.match(/<path\b[^>]*>/u)![0])
    expect(tile).toContain(source.match(/<defs>[\s\S]*<\/defs>/u)![0])
    expect(maskable).toContain(`transform="translate(512 512) scale(${MASKABLE_ARTWORK_SCALE}) translate(-512 -512)"`)
    expect(maskable).toContain('<rect width="1024" height="1024" fill="url(#tile)"/>')
    expect(maskable).not.toContain('rx="224"')
  })

  it('rejects non-PNG bytes and incomplete image headers', () => {
    expect(() => pngSize(Buffer.from('<svg/>'))).toThrow(/PNG IHDR/)
    expect(() => pngSize(Buffer.alloc(33))).toThrow(/PNG IHDR/)
  })

  it('fails loudly on a source without the tile it transforms', () => {
    expect(() => tileDocument('')).toThrow(/no root element/)
    expect(() => tileDocument('<svg></svg>')).toThrow(/no dark background/)
    expect(() => maskableDocument('<svg><rect fill="url(#tile)"/></svg>'))
      .toThrow(/no artwork group/)
  })
})
