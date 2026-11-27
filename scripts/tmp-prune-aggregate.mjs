// Prune aggregate references/includes whose target paths were removed by the merge.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

for (const path of ['tsconfig.host.json', 'tsconfig.client.json']) {
  const text = readFileSync(path, 'utf8')
  const lines = text.split('\n')
  const out = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const pathMatch = /"path": "([^"]+)"/.exec(line)
    if (pathMatch && !existsSync(resolve(pathMatch[1]))) {
      if (out.length > 0 && out[out.length - 1].trim() === '{') out.pop()
      if (lines[index + 1] !== undefined && /^\},?$/.test(lines[index + 1].trim())) index++
      continue
    }
    const fileMatch = /"([^"]+\.ts)"/.exec(line)
    if (fileMatch && !existsSync(resolve(fileMatch[1]))) continue
    out.push(line)
  }
  writeFileSync(path, `${out.join('\n').trimEnd()}\n`)
  console.log(`pruned ${path}`)
}
