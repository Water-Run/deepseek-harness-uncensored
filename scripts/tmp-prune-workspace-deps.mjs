// Remove workspace dependencies whose packages the merge dropped.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

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
const names = new Set()
const manifests = []
for (const dir of ['.', ...walk('packages'), ...walk('apps'), ...walk('vendor'), ...walk('benchmarks'), ...walk('python')]) {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) continue
  manifests.push(manifest)
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    if (parsed.name) names.add(parsed.name)
  } catch {}
}
let removed = 0
for (const manifest of manifests) {
  const text = readFileSync(manifest, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    continue
  }
  let changed = false
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = parsed[section]
    if (!deps) continue
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string' && version.startsWith('workspace:') && name.startsWith('@deepseek-ai/dsh-') && !names.has(name)) {
        delete deps[name]
        removed++
        changed = true
        console.log(`${manifest}: ${section} ${name}`)
      }
    }
  }
  if (changed) writeFileSync(manifest, `${JSON.stringify(parsed, null, 2)}\n`)
}
console.log(`removed ${removed} dangling workspace dependencies`)
