// Union DSHU references/includes/files into the alpha.2 face configs adopted by the merge.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { readdirSync } from 'node:fs'

const [oursRef, listFile] = process.argv.slice(2)
const show = (ref, path) => {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' })
  } catch {
    return undefined
  }
}
const parse = (text) => {
  const clean = text.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')
  return JSON.parse(clean)
}
const walkDirs = (dir, depth = 0) => {
  if (depth > 4) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    out.push(full, ...walkDirs(full, depth + 1))
  }
  return out
}
const nameToDir = new Map()
for (const dir of [...walkDirs(resolve('packages')), ...walkDirs(resolve('apps')), ...walkDirs(resolve('vendor'))]) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (manifest.name && !nameToDir.has(manifest.name)) nameToDir.set(manifest.name, dir)
  } catch {}
}
const packageNameAt = (dir) => {
  try {
    return JSON.parse(show(oursRef, `${dir.replace(/\\/g, '/')}/package.json`) ?? '{}').name
  } catch {
    return undefined
  }
}
const paths = readFileSync(listFile, 'utf8').split('\n').map(line => line.trim()).filter(Boolean)
let updated = 0
for (const path of paths) {
  if (path === 'tsconfig.base.json') continue
  const oursText = show(oursRef, path)
  if (!oursText) continue
  let ours
  let merged
  try {
    ours = parse(oursText)
    merged = parse(readFileSync(path, 'utf8'))
  } catch {
    continue
  }
  const base = dirname(path)
  let changed = false
  if (Array.isArray(ours.references)) {
    const existing = new Set((merged.references ?? []).map(entry => entry.path))
    const additions = ours.references
      .filter(entry => entry && typeof entry.path === 'string' && !existing.has(entry.path))
      .filter(entry => { if (existsSync(resolve(base, entry.path))) return true; return false })
      .map(entry => ({ path: entry.path }))
    if (additions.length > 0) {
      merged.references = [...(merged.references ?? []), ...additions]
      changed = true
    }
  }
  for (const key of ['files', 'include']) {
    if (!Array.isArray(ours[key])) continue
    const existing = new Set(merged[key] ?? [])
    const additions = ours[key].filter(entry => entry && !existing.has(entry) && existsSync(resolve(base, entry.replace(/\*.*$/, ''))))
    if (additions.length > 0) {
      merged[key] = [...(merged[key] ?? []), ...additions]
      changed = true
    }
  }
  if (changed) {
    writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`)
    updated++
  }
}
console.log(`updated ${updated} configs`)
const missing = (merged.references ?? []).filter(entry => entry && typeof entry.path === 'string' && !existsSync(resolve(base, entry.path)))
for (const entry of missing) {
  const oursDir = relative(resolve('.'), resolve(base, entry.path)).replace(/\\/g, '/')
  const name = packageNameAt(oursDir)
  const moved = name ? nameToDir.get(name) : undefined
  if (!moved) continue
  let next = relative(base, moved).replace(/\\/g, '/')
  if (!next.startsWith('.')) next = `./${next}`
  entry.path = next
  changed = true
}
