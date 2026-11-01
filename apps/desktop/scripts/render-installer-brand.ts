/** Rebuild installer artwork from the application's canonical dark whale vector. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'

/**
 * Compose an installer bitmap using the same vector as the installed application.
 * @param icon - Repository-owned application SVG.
 * @param appearance - Installer palette; the uninstall sidebar uses its own dark background.
 * @param scale - One or two physical pixels per logical pixel.
 * @param sidebar - Render the compact NSIS uninstall sidebar instead of the welcome brand.
 * @returns A PNG with opaque background and independent DSHU identity.
 */
export async function renderInstallerBrand(icon: Buffer, appearance: 'light' | 'dark', scale: 1 | 2, sidebar = false): Promise<Buffer> {
  const width = sidebar ? 164 : 600, height = sidebar ? 314 : 196
  const dark = sidebar || appearance === 'dark'
  const background = dark ? '#151517' : '#ffffff', ink = dark ? '#f7f8fa' : '#0f1115'
  const secondary = dark ? '#b9bec8' : '#646b75'
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="${background}"/>
<image x="${sidebar ? 30 : 248}" y="${sidebar ? 38 : 0}" width="104" height="104" href="data:image/svg+xml;base64,${icon.toString('base64')}"/>
<g text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">
<text x="${width / 2}" y="${sidebar ? 184 : 141}" font-size="30" font-weight="600" letter-spacing="3" fill="${ink}">DSHU</text>
${sidebar
  ? `<text x="82" y="219" font-size="14" fill="${secondary}">DeepSeek Harness</text><text x="82" y="243" font-size="17" font-weight="500" fill="${ink}">Uncensored</text>`
  : `<text x="300" y="179" font-size="18" fill="${secondary}">DeepSeek Harness Uncensored</text>`}
</g></svg>`
  return sharp(Buffer.from(artwork), { density: 72 * scale }).resize(width * scale, height * scale).png().toBuffer()
}

/** Regenerate all committed installer bitmap sizes from the vector source. */
async function main(): Promise<void> {
  const icon = await readFile(new URL('../resources/icon.svg', import.meta.url))
  for (const appearance of ['light', 'dark'] as const) {
    for (const scale of [1, 2] as const) {
      const name = `brand${appearance === 'dark' ? '-dark' : ''}${scale === 2 ? '-2x' : ''}.png`
      await writeFile(new URL(`../installer/assets/${name}`, import.meta.url), await renderInstallerBrand(icon, appearance, scale))
    }
  }
  await writeFile(new URL('../installer/assets/uninstaller-sidebar.png', import.meta.url), await renderInstallerBrand(icon, 'dark', 1, true))
  console.log(`DSHU installer artwork: ${fileURLToPath(new URL('../installer/assets/', import.meta.url))}`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
