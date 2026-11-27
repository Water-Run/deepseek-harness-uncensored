import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const tc = 'C:\\Users\\linzh\\DSHU-Deliveries\\20261127\\toolchain\\bin'
process.env.PATH = `${tc};${process.env.PATH}`
for (let round = 0; round < 6; round++) {
  let out = ''
  try {
    execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.client.json'], { encoding: 'utf8', stdio: 'pipe' })
    console.log(`round ${round}: client aggregate clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const missing = [...out.matchAll(/File '([^']+)' is not listed within the file list of project '[^']*tsconfig\.client\.json'/g)]
    .map(match => match[1].replace(/\\/g, '/').replace(`${process.cwd().replace(/\\/g, '/')}/`, ''))
  const unique = [...new Set(missing)]
  if (unique.length === 0) {
    console.log(`round ${round}: no missing includes`)
    console.log(out.split('\n').filter(line => line.includes('error TS')).slice(0, 5).join('\n'))
    break
  }
  const text = readFileSync('tsconfig.client.json', 'utf8')
  const parsed = JSON.parse(text)
  const additions = unique.filter(file => !parsed.include.includes(file))
  if (additions.length === 0) break
  parsed.include = [...parsed.include, ...additions]
  writeFileSync('tsconfig.client.json', `${JSON.stringify(parsed, null, 2)}\n`)
  console.log(`round ${round}: added ${additions.length} include entries`)
}
