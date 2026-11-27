// Add fixture files the host aggregate needs because restored DSHU tests import them.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const tc = 'C:\\Users\\linzh\\DSHU-Deliveries\\20261127\\toolchain\\bin'
process.env.PATH = `${tc};${process.env.PATH}`
for (let round = 0; round < 6; round++) {
  let out = ''
  try {
    out = execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.host.json'], { encoding: 'utf8', stdio: 'pipe' }).toString()
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const missing = [...out.matchAll(/File '([^']+)' is not listed within the file list of project '[^']*tsconfig\.host\.json'/g)]
    .map(match => match[1].replace(/\\/g, '/').replace(`${process.cwd().replace(/\\/g, '/')}/`, ''))
  const unique = [...new Set(missing)]
  if (unique.length === 0) {
    console.log(`round ${round}: no missing aggregate files`)
    break
  }
  const text = readFileSync('tsconfig.host.json', 'utf8')
  const lines = text.split('\n')
  const index = lines.findIndex(line => /"include": \[/.test(line))
  if (index < 0) throw new Error('include array not found')
  const additions = unique.filter(file => !text.includes(`"${file}"`)).map(file => `    "${file}",`)
  lines.splice(index + 1, 0, ...additions)
  writeFileSync('tsconfig.host.json', lines.join('\n'))
  console.log(`round ${round}: added ${additions.length} include entries`)
  if (additions.length === 0) break
}
