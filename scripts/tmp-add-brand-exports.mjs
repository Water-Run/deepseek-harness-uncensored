import { readFileSync, writeFileSync } from 'node:fs'
for (const dir of ['packages/browser-use/browser-use', 'packages/computer-use/computer-use']) {
  const file = `${dir}/package.json`
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (parsed.exports['./brand'] === undefined) {
    parsed.exports['./brand'] = { types: './lib/types/brand.d.ts', default: './lib/types/brand.js' }
    writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`)
    console.log(`${dir}: ./brand export added`)
  }
}
