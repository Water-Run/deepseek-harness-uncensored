import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const packages = new Map()
for (const group of readdirSync('packages')) {
  const groupPath = join('packages', group)
  if (!statSync(groupPath).isDirectory()) continue
  for (const name of readdirSync(groupPath)) {
    const dir = join(groupPath, name)
    const manifest = join(dir, 'package.json')
    if (!existsSync(manifest)) continue
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
    if (parsed.name !== undefined) packages.set(parsed.name, { dir, exports: parsed.exports ?? {} })
  }
}

const missing = new Map()
const walk = dir => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'lib' || entry === 'tests' || entry === 'locale') continue
      walk(path)
      continue
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) continue
    const text = readFileSync(path, 'utf8')
    for (const match of text.matchAll(/['"](@deepseek-ai\/dsh-[a-z0-9-]+)(\/[^'"]*)['"]/g)) {
      const [, name, subpath] = match
      const pkg = packages.get(name)
      if (pkg === undefined) continue
      const requested = subpath.slice(2)
      const keys = Object.keys(pkg.exports)
      const covered = keys.some(key => key === '.' || key === `./${requested}`
        || (key.endsWith('/*') && requested.startsWith(key.slice(2, -1)))
        || key === './src/*')
      if (!covered) missing.set(`${name}${subpath}`, `${name} (${pkg.dir}) lacks ${subpath}`)
    }
  }
}
walk('packages')
console.log([...missing.values()].join('\n') || 'all imported subpaths are exported')
