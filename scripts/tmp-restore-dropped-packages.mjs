// Restore every DSHU package directory that the merge dropped but the DSHU tree owns.
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const list = execFileSync('git', ['ls-tree', '-r', '--name-only', ours], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
const dirs = new Set()
for (const path of list.split('\n')) {
  const match = /^((?:packages|apps)\/[^/]+\/[^/]+)\/package\.json$/.exec(path)
  if (match) dirs.add(match[1])
}
let restored = 0
for (const dir of dirs) {
  if (existsSync(`${dir}/package.json`)) continue
  try {
    execFileSync('git', ['rm', '-r', '-q', '--cached', dir], { stdio: 'ignore' })
  } catch {}
  rmSync(dir, { recursive: true, force: true })
  execFileSync('git', ['checkout', ours, '--', dir], { stdio: 'ignore' })
  restored++
  console.log(`restored ${dir}`)
}
console.log(`${restored} DSHU package directories restored`)
