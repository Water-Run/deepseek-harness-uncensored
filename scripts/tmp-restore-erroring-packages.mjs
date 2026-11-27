// Restore the DSHU version of every client package whose restored tests fail against the kernel sources.
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const git = (...args) => execFileSync('git', args, { stdio: 'ignore' })
const run = () => execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/typescript/bin/tsc', '-b', 'tsconfig.client.json'], { encoding: 'utf8', stdio: 'pipe' })

const restored = new Set()
for (let round = 0; round < 6; round++) {
  let out = ''
  try {
    run()
    console.log(`round ${round}: client aggregate clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}`
  }
  const packages = new Set()
  for (const line of out.split('\n')) {
    const match = /^((?:packages|apps)\/[^\s(]+\/[^\s(]+)\/[^\s(]+\.tsx?\(\d+,\d+\): error/.exec(line)
    if (match) packages.add(match[1])
  }
  let restoredThisRound = 0
  for (const dir of packages) {
    if (restored.has(dir)) continue
    try {
      execFileSync('git', ['cat-file', '-e', `${ours}:${dir}/package.json`], { stdio: 'ignore' })
    } catch {
      continue
    }
    try { git('rm', '-r', '-q', '--cached', dir) } catch {}
    rmSync(dir, { recursive: true, force: true })
    git('checkout', ours, '--', dir)
    restored.add(dir)
    restoredThisRound++
    console.log(`restored ${dir}`)
  }
  if (restoredThisRound === 0) {
    const remaining = out.split('\n').filter(line => line.includes('error TS')).length
    console.log(`round ${round}: nothing left to restore; ${remaining} errors remain`)
    break
  }
}
