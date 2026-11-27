import { readFileSync, writeFileSync } from 'node:fs'

const path = 'tsconfig.host.json'
let text = readFileSync(path, 'utf8')
if (!text.includes('"exclude": [')) throw new Error('exclude array missing')
const lines = text.split('\n')
const excludeIndex = lines.findIndex(line => line.includes('"exclude": ['))
let last = excludeIndex - 1
while (last > 0 && lines[last].trim() === '') last--
const entry = lines[last].trimEnd()
if (!entry.endsWith(']') && !entry.endsWith('],')) {
  lines[last] = entry.replace(/,$/, '')
  lines.splice(last + 1, 0, '  ],')
  writeFileSync(path, lines.join('\n'))
}
const parsed = JSON.parse(readFileSync(path, 'utf8'))
parsed.include = parsed.include.filter(entry => entry !== 'website/docs.ts')
if (!parsed.references.some(reference => reference.path === './packages/client/hmr/tsconfig.host.json')) {
  parsed.references.push({ path: './packages/client/hmr/tsconfig.host.json' })
}
writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
console.log(`host aggregate valid; refs=${parsed.references.length} include=${parsed.include.length}`)
