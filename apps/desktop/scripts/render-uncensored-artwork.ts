/** Generate the desktop and browser icons from the shared whale silhouette. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { renderAppIconEntries } from './render-app-icon.ts'
import { packIco, renderTrayIconEntries } from './render-tray-icon.ts'

const root = resolve(import.meta.dirname, '../../..')
const artwork = await readFile(resolve(root, 'apps/desktop/resources/icon.svg'), 'utf8')
const bytes = Buffer.from(artwork)
for (const name of ['icon', 'icon-windows', 'icon-macos']) {
  await writeFile(resolve(root, `apps/desktop/resources/${name}.svg`), artwork)
  await sharp(bytes).png().toFile(resolve(root, `apps/desktop/resources/${name}.png`))
}
await writeFile(resolve(root, 'apps/desktop/resources/icon-windows.ico'), packIco(await renderAppIconEntries(bytes)))
await writeFile(resolve(root, 'apps/desktop/resources/tray-windows.ico'), packIco(await renderTrayIconEntries(bytes)))
for (const name of ['favicon.svg', 'favicon-dark.svg']) await writeFile(resolve(root, `apps/web/public/${name}`), artwork)
