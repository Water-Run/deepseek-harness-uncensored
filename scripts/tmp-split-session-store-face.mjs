// Move the host-only Context.sessions declaration out of the face-neutral session entry.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

const index = 'packages/core/session/src/index.ts'
let text = readFileSync(index, 'utf8')
const declaration = `declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }

`
if (!text.includes(declaration)) throw new Error('sessions declaration not found')
text = text.replace(declaration, "declare module '@deepseek-ai/cordis' {\n")
writeFileSync(index, text)

writeFileSync('packages/core/session/src/context.ts', `/** Host Context registration of the Session store; client programs declare their own Session service. */
import type { SessionStore } from './index.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions: SessionStore
  }
}
`)

const host = JSON.parse(readFileSync('packages/core/session/tsconfig.json', 'utf8'))
if (!host.include.includes('src/context.ts')) host.include.push('src/context.ts')
writeFileSync('packages/core/session/tsconfig.json', `${JSON.stringify(host, null, 2)}\n`)

const client = {
  extends: '../../../tsconfig.base.client.json',
  compilerOptions: { rootDir: 'src', outDir: 'lib/types', tsBuildInfoFile: 'lib/tsconfig.client.tsbuildinfo' },
  include: ['src'],
  exclude: ['src/context.ts'],
  references: host.references,
}
writeFileSync('packages/core/session/tsconfig.client.json', `${JSON.stringify(client, null, 2)}\n`)

// Client programs must reference the client face of the session package.
const isClientProgram = (file) => /tsconfig\.client\.json$/.test(file) || /^packages\/client\//.test(file)
  || /^packages\/experimental\/client-/.test(file) || /^apps\/web\//.test(file) || /^packages\/test-support\/client-runtime\//.test(file)
let rewritten = 0
const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .filter(entry => entry.name !== 'node_modules' && !entry.name.startsWith('.'))
  .flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [`${dir}/${entry.name}`])
for (const file of walk('.')) {
  if (!/tsconfig.*\.json$/.test(file) || !isClientProgram(file)) continue
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(parsed.references)) continue
  let changed = false
  for (const entry of parsed.references) {
    if (!entry || typeof entry.path !== 'string') continue
    if (!/(^|\/)core\/session$/.test(entry.path)) continue
    const target = join(dirname(file), entry.path, 'tsconfig.client.json')
    if (!existsSync(target)) continue
    entry.path = `${entry.path}/tsconfig.client.json`
    changed = true
    rewritten++
  }
  if (changed) writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`)
}
console.log(`session face split done; client references rewritten: ${rewritten}`)
