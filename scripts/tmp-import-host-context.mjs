// Host packages opt into the host Context.sessions declaration explicitly.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const tc = 'C:\\Users\\linzh\\DSHU-Deliveries\\20261127\\toolchain\\bin'
process.env.PATH = `${tc};${process.env.PATH}`
for (let round = 0; round < 8; round++) {
  let out = ''
  try {
    execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.host.json'], { encoding: 'utf8', stdio: 'pipe' })
    console.log(`round ${round}: host aggregate clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const files = new Set()
  for (const match of out.matchAll(/((?:packages|apps)\/[^\s(]+\.tsx?)\(\d+,\d+\): error TS2339: Property 'sessions' does not exist on type 'Context'/g)) {
    files.add(match[1])
  }
  if (files.size === 0) {
    console.log(`round ${round}: no sessions errors`)
    console.log(out.split('\n').slice(0, 6).join('\n'))
    break
  }
  for (const file of files) {
    let text = readFileSync(file, 'utf8')
    if (text.includes("dsh-session/context")) continue
    const importLine = "import type {} from '@deepseek-ai/dsh-session/context'\n"
    const firstImport = text.search(/^import /m)
    text = firstImport >= 0 ? `${text.slice(0, firstImport)}${importLine}${text.slice(firstImport)}` : `${importLine}${text}`
    writeFileSync(file, text)
    console.log(`${file}: host session context imported`)
  }
}
