import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const show = path => execFileSync('git', ['show', `b9eae02:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

writeFileSync('apps/desktop/src/parent-authentication.ts', show('apps/desktop/src/parent-authentication.ts'))

let host = show('apps/desktop/src/host-process.ts')
if (!host.includes('stderrTail')) {
  host = host.replace(
    "  private stderr = ''",
    "  private stderr = ''\n\n  /** Recent Host stderr, for timeout diagnostics that never see an exit. */\n  stderrTail(): string {\n    return this.stderr.trim()\n  }",
  )
}
if (!host.includes('desktop host: spawned')) {
  host = host.replace(
    "    child.stderr?.setEncoding('utf8')",
    "    console.log(`desktop host: spawned pid ${String(child.pid)} node=${this.node} entry=${entry}`)\n    child.stderr?.setEncoding('utf8')",
  )
}
writeFileSync('apps/desktop/src/host-process.ts', host)

const mainFile = 'apps/desktop/src/main.ts'
let main = readFileSync(mainFile, 'utf8')
if (main.includes('const cookie = await authenticateWebHost(ready.url)')) {
  main = main.replace('const cookie = await authenticateWebHost(ready.url)', 'const cookie = ready.authenticationCookie')
  writeFileSync(mainFile, main)
  console.log('main: Host cookie now comes from the parent handshake')
}

const smokeFile = 'apps/desktop/scripts/smoke-runtime.ts'
let smoke = readFileSync(smokeFile, 'utf8')
const loginBlock = `    const login = await fetch(ready.url, { redirect: 'manual' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')`
if (smoke.includes(loginBlock)) {
  smoke = smoke.replace(loginBlock, '    const cookie = ready.authenticationCookie')
  writeFileSync(smokeFile, smoke)
  console.log('smoke: uses the Host parent-handshake cookie')
}

console.log('desktop authentication seam adopted')
