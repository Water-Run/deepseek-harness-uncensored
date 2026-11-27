// Remap DSHU project references whose package moved between rc.5 and alpha.2.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const [oursRef, root] = process.argv.slice(2)
const show = (path) => {
  try {
    return execFileSync('git', ['show', `${oursRef}:${path}`], { encoding: 'utf8' })
  } catch {
    return undefined
  }
}
const packageNameAt = (dir) => {
  const text = show(`${dir.replace(/\\/g, '/')}/package.json`)
  if (!text) return undefined
  try {
    return JSON.parse(text).name
  } catch {
    return undefined
  }
}
const walk = (dir, depth = 0) => {
  if (depth > 4) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    out.push(full, ...walk(full, depth + 1))
  }
  return out
}
const nameToDir = new Map()
for (const dir of walk(resolve(root, 'packages')).concat(walk(resolve(root, 'apps')), walk(resolve(root, 'vendor')))) {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) continue
  try {
    const name = JSON.parse(readFileSync(manifest, 'utf8')).name
    if (name && !nameToDir.has(name)) nameToDir.set(name, dir)
  } catch {}
}
const configs = execFileSync('git', ['ls-files', '*tsconfig*.json'], { encoding: 'utf8', cwd: root }).split('\n').filter(Boolean)
let fixed = 0
for (const path of configs) {
  const full = resolve(root, path)
  let merged
  try {
    merged = JSON.parse(readFileSync(full, 'utf8'))
  } catch {
    continue
  }
  if (!Array.isArray(merged.references)) continue
  const base = dirname(full)
  let changed = false
  for (const entry of merged.references) {
    if (!entry || typeof entry.path !== 'string') continue
    if (existsSync(resolve(base, entry.path))) continue
    const target = resolve(base, entry.path)
    const oursDir = relative(resolve(root), target).replace(/\\/g, '/')
    const name = packageNameAt(oursDir)
    if (!name) continue
    const moved = nameToDir.get(name)
    if (!moved) continue
    entry.path = relative(base, moved).replace(/\\/g, '/')
    if (!entry.path.startsWith('.')) entry.path = `./${entry.path}`
    changed = true
    fixed++
  }
  if (changed) writeFileSync(full, `${JSON.stringify(merged, null, 2)}\n`)
}
console.log(`remapped ${fixed} references`)
