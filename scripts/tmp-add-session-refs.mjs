// Add host-face project references for packages pulled in by the restored session controller.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const config = 'packages/api/session-controller/tsconfig.host.json'
for (let round = 0; round < 10; round++) {
  let out = ''
  try {
    execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.host.json'], { encoding: 'utf8', stdio: 'pipe' })
    console.log(`round ${round}: host aggregate clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const roots = new Set()
  for (const match of out.matchAll(/File '([^']+)' is not under 'rootDir'/g)) {
    const file = match[1].replace(/\\/g, '/')
    const root = file.replace(/\/src\/.*$/, '')
    roots.add(root)
  }
  const parsed = JSON.parse(readFileSync(config, 'utf8'))
  const existing = new Set((parsed.references ?? []).map(entry => entry.path))
  const additions = []
  for (const root of roots) {
    let path = relative('packages/api/session-controller', root.replace(`${process.cwd().replace(/\\/g, '/')}/`, '')).replace(/\\/g, '/')
    if (!path.startsWith('.')) path = `./${path}`
    const face = existsSync(resolve(root, 'tsconfig.host.json')) ? '/tsconfig.host.json' : ''
    const candidate = `${path}${face}`
    if (existing.has(candidate)) continue
    if (!existsSync(resolve('packages/api/session-controller', candidate.replace(/\/tsconfig\.host\.json$/, '')))) continue
    additions.push({ path: candidate })
  }
  if (additions.length === 0) {
    console.log(`round ${round}: nothing to add (${roots.size} roots)`)
    console.log(out.split('\n').slice(0, 4).join('\n'))
    break
  }
  parsed.references = [...(parsed.references ?? []), ...additions]
  writeFileSync(config, `${JSON.stringify(parsed, null, 2)}\n`)
  console.log(`round ${round}: added ${additions.length} references`)
}
