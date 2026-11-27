import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['packages', 'apps', 'vendor']
const missing = []
for (const root of roots) {
  for (const group of readdirSync(root)) {
    const groupPath = join(root, group)
    if (!statSync(groupPath).isDirectory()) continue
    for (const name of readdirSync(groupPath)) {
      const dir = join(groupPath, name)
      if (!statSync(dir).isDirectory()) continue
      const configs = ['tsdown.config.ts'].map(file => join(dir, file)).filter(existsSync)
      for (const config of configs) {
        const text = readFileSync(config, 'utf8')
        for (const match of text.matchAll(/'((?:lib\/)(?:types\/)?[^']+\.js)'/g)) {
          const file = join(dir, match[1])
          if (!existsSync(file)) missing.push(`${config}: ${match[1]}`)
        }
      }
    }
  }
}
console.log(missing.join('\n'))
