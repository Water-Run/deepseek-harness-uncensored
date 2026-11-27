// Tests that render focused views need the package's locale/slot augmentations loaded.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

for (let round = 0; round < 6; round++) {
  let out = ''
  try {
    execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.client.json'], { encoding: 'utf8', stdio: 'pipe' })
    console.log(`round ${round}: client aggregate clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const files = new Set()
  for (const line of out.split('\n')) {
    if (!/Property 't' does not exist|is not assignable to parameter of type 'TranslateNS/.test(line)) continue
    const match = /^([^\s(]+\.tsx?)\(\d+,\d+\)/.exec(line)
    if (match) files.add(match[1])
  }
  let patched = 0
  for (const file of files) {
    const parts = file.split('/')
    const packageRoot = parts.slice(0, 4).join('/')
    const index = join(packageRoot, 'src/client/index.ts')
    if (!existsSync(index) || !file.includes('/tests/')) continue
    let target = relative(dirname(file), index).replace(/\\/g, '/')
    if (!target.startsWith('.')) target = `./${target}`
    let text = readFileSync(file, 'utf8')
    if (text.includes(`from '${target}'`)) continue
    const line = `import type {} from '${target}'\n`
    const firstImport = text.search(/^import /m)
    text = firstImport >= 0 ? `${text.slice(0, firstImport)}${line}${text.slice(firstImport)}` : `${line}${text}`
    writeFileSync(file, text)
    patched++
  }
  console.log(`round ${round}: augmentation imports added to ${patched} tests`)
  if (patched === 0) break
}
