import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = '0.2.3-alpha.2'
let changed = 0
for (const group of readdirSync('packages')) {
  const groupPath = join('packages', group)
  if (!statSync(groupPath).isDirectory()) continue
  for (const name of readdirSync(groupPath)) {
    const dir = join(groupPath, name)
    if (!statSync(dir).isDirectory()) continue
    const file = join(dir, 'package.json')
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const manifest = JSON.parse(text)
    if (manifest.version === undefined || manifest.version === target) continue
    manifest.version = target
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
    changed++
    console.log(`version -> ${target}: ${manifest.name} (was ${JSON.parse(text).version})`)
  }
}
console.log(`${changed} package manifests aligned to ${target}`)
