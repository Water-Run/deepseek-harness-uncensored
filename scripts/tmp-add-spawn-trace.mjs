import { readFileSync, writeFileSync } from 'node:fs'

const hostFile = 'apps/desktop/src/host-process.ts'
let host = readFileSync(hostFile, 'utf8')
if (!host.includes('desktop host: spawned')) {
  host = host.replace(
    "    child.stderr?.setEncoding('utf8')",
    "    console.log(`desktop host: spawned pid ${String(child.pid)} node=${this.node} entry=${entry}`)\n    child.stderr?.setEncoding('utf8')",
  )
  host = host.replace(
    "    child.stderr?.on('data', (chunk: string) => { this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS) })",
    "    child.stderr?.on('data', (chunk: string) => {\n      this.stderr = (this.stderr + chunk).slice(-MAX_HOST_DIAGNOSTIC_CHARS)\n      if (process.env.DSH_DESKTOP_BOOT_TRACE === '1') process.stderr.write(`host stderr: ${chunk}`)\n    })",
  )
  writeFileSync(hostFile, host)
  console.log('host spawn trace added')
}

const smokeFile = 'apps/desktop/scripts/smoke-runtime.ts'
let smoke = readFileSync(smokeFile, 'utf8')
if (!smoke.includes('DSH_DESKTOP_BOOT_TRACE')) {
  smoke = smoke.replace(
    'DSH_HOME: harnessHome, DSH_UNCENSORED_HOME: harnessHome,',
    "DSH_HOME: harnessHome, DSH_UNCENSORED_HOME: harnessHome, DSH_DESKTOP_BOOT_TRACE: '1',",
  )
  writeFileSync(smokeFile, smoke)
  console.log('smoke host trace enabled')
}
