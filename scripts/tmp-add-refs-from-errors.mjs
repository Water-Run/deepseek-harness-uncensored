// Add the project references that the restored DSHU sources need in the kernel face configs.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const packageRootOf = (file) => {
  let dir = dirname(resolve(file))
  while (dir !== resolve(dir, '..')) {
    if (existsSync(`${dir}/package.json`)) return dir
    dir = resolve(dir, '..')
  }
  return undefined
}
for (let round = 0; round < 8; round++) {
  let out = ''
  try {
    execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.host.json'], { encoding: 'utf8', stdio: 'pipe' })
    console.log(`round ${round}: host aggregate clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const matches = [...out.matchAll(/File '([^']+)' is not under 'rootDir' '([^']+)'/g)]
  const edits = new Map()
  for (const match of matches) {
    const file = match[1].replace(/\\/g, '/')
    const projectDir = match[2].replace(/\\/g, '/')
    const target = packageRootOf(file)
    if (!target) continue
    const projectPackage = packageRootOf(`${projectDir}/x`)
    const config = projectDir === projectPackage ? `${projectDir}/tsconfig.json` : `${projectDir}/tsconfig.host.json`
    if (!existsSync(config)) continue
    let path = relative(projectPackage ?? dirname(config), target).replace(/\\/g, '/')
    const face = existsSync(`${target}/tsconfig.host.json`) && !file.includes('/src/client/') ? '/tsconfig.host.json' : ''
    path = `${path}${face}`
    if (!path.startsWith('.')) path = `./${path}`
    if (!edits.has(config)) edits.set(config, new Set())
    edits.get(config).add(path)
  }
  if (edits.size === 0) {
    console.log(`round ${round}: no reference edits (${matches.length} matches)`)
    console.log(out.split('\n').slice(0, 6).join('\n'))
    break
  }
  let added = 0
  for (const [config, paths] of edits) {
    const parsed = JSON.parse(readFileSync(config, 'utf8'))
    const existing = new Set((parsed.references ?? []).map(entry => entry.path))
    const additions = [...paths].filter(path => !existing.has(path) && existsSync(resolve(dirname(config), path.replace(/\/tsconfig\.host\.json$/, ''))))
    if (additions.length === 0) continue
    parsed.references = [...(parsed.references ?? []), ...additions.map(path => ({ path }))]
    writeFileSync(config, `${JSON.stringify(parsed, null, 2)}\n`)
    added += additions.length
  }
  console.log(`round ${round}: added ${added} references`)
  if (added === 0) break
}
