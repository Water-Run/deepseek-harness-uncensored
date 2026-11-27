import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const missing = []
for (const group of readdirSync('packages')) {
  const groupPath = join('packages', group)
  if (!statSync(groupPath).isDirectory()) continue
  for (const name of readdirSync(groupPath)) {
    const dir = join(groupPath, name)
    if (!statSync(dir).isDirectory()) continue
    const config = join(dir, 'tsdown.config.ts')
    if (!existsSync(config)) continue
    const text = readFileSync(config, 'utf8')
    for (const match of text.matchAll(/clientBundle\([^)]*?\[([^\]]+)\]/gs)) {
      for (const entryMatch of match[1].matchAll(/'([^']+)'/g)) {
        const entry = entryMatch[1]
        if (!existsSync(join(dir, entry))) missing.push(`${dir}: ${entry}`)
      }
    }
  }
}
console.log(missing.join('\n') || 'all clientBundle entries exist')
