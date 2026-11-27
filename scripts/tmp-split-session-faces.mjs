import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'

const theirs = 'b9eae02a14bd56e6354a081a0c6a1101e7741c99'
const show = (path) => {
  try {
    return execFileSync('git', ['show', `${theirs}:${path}`], { encoding: 'utf8' })
  } catch {
    return undefined
  }
}
const pkg = 'packages/api/session-controller'
for (const name of ['tsconfig.json', 'tsconfig.host.json', 'tsconfig.client.json']) {
  const text = show(`${pkg}/${name}`)
  if (text) writeFileSync(`${pkg}/${name}`, text)
}
console.log('restored kernel face configs for session-controller')

// Include every DSHU source file that the kernel face lists do not know about.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`])
const files = walk(`${pkg}/src`).map(file => file.replace(`${pkg}/`, ''))
for (const name of ['tsconfig.host.json', 'tsconfig.client.json']) {
  const path = `${pkg}/${name}`
  if (!existsSync(path)) continue
  const config = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(config.files)) continue
  const existing = new Set(config.files)
  const extra = files.filter(file => !existing.has(file) && (name.includes('client') ? file.startsWith('src/client/') : !file.startsWith('src/client/')))
  if (extra.length > 0) {
    config.files = [...config.files, ...extra]
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
    console.log(`${name}: +${extra.length} files`)
  }
}
