import { readFileSync, writeFileSync } from 'node:fs'

const hostFile = 'apps/desktop/src/host-process.ts'
let host = readFileSync(hostFile, 'utf8')
if (!host.includes('stderrTail()')) {
  host = host.replace(
    "  private stderr = ''",
    "  private stderr = ''\n\n  /** Recent Host stderr, for timeout diagnostics that never see an exit. */\n  stderrTail(): string {\n    return this.stderr.trim()\n  }",
  )
  writeFileSync(hostFile, host)
  console.log('host diagnostics accessor added')
}

const smokeFile = 'apps/desktop/scripts/smoke-runtime.ts'
let smoke = readFileSync(smokeFile, 'utf8')
const needle = "reject(new Error('desktop runtime: Host readiness exceeded 120 seconds'))"
if (smoke.includes(needle)) {
  smoke = smoke.replaceAll(
    needle,
    "reject(new Error(`desktop runtime: Host readiness exceeded 120 seconds${host.stderrTail() === '' ? '' : `: ${host.stderrTail()}`}`))",
  )
  writeFileSync(smokeFile, smoke)
  console.log('smoke timeout now reports Host stderr')
}
