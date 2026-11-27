import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const aggregate = 'tsconfig.host.json'
const parsed = JSON.parse(readFileSync(aggregate, 'utf8'))
const existing = new Set(parsed.references.map(entry => entry.path))
let added = 0
for (const group of readdirSync('packages/client', { withFileTypes: true }).filter(entry => entry.isDirectory())) {
  const face = join('packages/client', group.name, 'tsconfig.host.json')
  if (!existsSync(face)) continue
  const path = `./${face.replace(/\\/g, '/')}`
  if (existing.has(path)) continue
  parsed.references.push({ path })
  existing.add(path)
  added++
}
writeFileSync(aggregate, `${JSON.stringify(parsed, null, 2)}\n`)
console.log(`added ${added} client host faces to the host aggregate`)
