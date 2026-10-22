/**
 * Render the Windows application icon from `resources/icon-windows.svg`.
 *
 * The tray icon deliberately enlarges the whale for 16 px legibility; the
 * application icon must keep the artwork as drawn, so this renderer scans the
 * whole tile at each size instead. The committed `resources/icon-windows.ico`
 * is the output; rerun `pnpm run render:app-icon` in `apps/desktop` after
 * changing the vector source.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { packIco } from './render-tray-icon.ts'

/** Edges bundled in the application icon: taskbar, small tiles, and the large shell sizes. */
export const APP_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256] as const

/** Vector source and committed output of the application icon. */
export const APP_ICON_PATHS = {
  source: fileURLToPath(new URL('../resources/icon.svg', import.meta.url)),
  output: fileURLToPath(new URL('../resources/icon-windows.ico', import.meta.url)),
} as const

/** Coordinate space of the vector source; sharp's SVG density scales against it. */
const SOURCE_EDGE = 1024
const SOURCE_DENSITY = 72

/**
 * Rasterize the complete application tile at every requested edge length.
 * @param svg - vector source of the application icon.
 * @param sizes - edge lengths to emit, one bitmap each.
 * @returns one PNG bitmap per requested size, ready for {@link packIco}.
 */
export async function renderAppIconEntries(svg: Buffer, sizes: readonly number[] = APP_ICON_SIZES) {
  return Promise.all(sizes.map(async size => ({
    size,
    png: await sharp(svg, { density: SOURCE_DENSITY * size / SOURCE_EDGE }).resize(size, size).png().toBuffer(),
  })))
}

/** Render and write the committed icon. */
async function main(): Promise<void> {
  const entries = await renderAppIconEntries(await readFile(APP_ICON_PATHS.source))
  await writeFile(APP_ICON_PATHS.output, packIco(entries))
  console.log(`wrote ${APP_ICON_PATHS.output}`)
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/gu, '/'))) {
  await main()
}
