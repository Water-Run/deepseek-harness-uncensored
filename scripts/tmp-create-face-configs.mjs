// Materialize the face configs other projects reference for restored DSHU client packages.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .filter(entry => entry.name !== 'node_modules' && !entry.name.startsWith('.'))
  .flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [`${dir}/${entry.name}`])

const created = new Set()
for (const file of walk('.')) {
  if (!/tsconfig.*\.json$/.test(file)) continue
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  for (const entry of parsed.references ?? []) {
    if (!entry || typeof entry.path !== 'string') continue
    if (!/tsconfig\.(client|host)\.json$/.test(entry.path)) continue
    const target = resolve(dirname(file), entry.path)
    if (existsSync(target)) continue
    const pkgDir = dirname(target)
    const baseConfig = join(pkgDir, 'tsconfig.json')
    if (!existsSync(baseConfig) || created.has(target)) continue
    const face = /client/.test(entry.path) ? 'client' : 'host'
    const base = JSON.parse(readFileSync(baseConfig, 'utf8'))
    const config = {
      extends: face === 'client' ? '../../../tsconfig.base.client.json' : '../../../tsconfig.base.json',
      compilerOptions: {
        rootDir: 'src',
        outDir: 'lib/types',
        tsBuildInfoFile: `lib/tsconfig.${face}.tsbuildinfo`,
      },
      include: ['src'],
      references: base.references ?? [],
    }
    writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`)
    created.add(target)
    console.log(`created ${relative('.', target)}`)
  }
}
console.log(`${created.size} face configs created`)
