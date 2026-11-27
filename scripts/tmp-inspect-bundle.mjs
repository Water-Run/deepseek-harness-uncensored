import { readFileSync } from 'node:fs'

const file = 'packages/client/ui-settings-models/lib/client.js'
const text = readFileSync(file, 'utf8')
console.log('length', text.length)
for (const needle of ['JmHv', 'P3E2nq', 'position:fixed', 'position: fixed', 'createElement("style")', 'adoptedStyleSheets', 'styleTag', '<style']) {
  console.log(JSON.stringify(needle), text.includes(needle))
}
const idx = text.indexOf('JmHv')
console.log('context:', text.slice(Math.max(0, idx - 200), idx + 200))
