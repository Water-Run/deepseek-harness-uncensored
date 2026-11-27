// Restore the DSHU fork's own packages where the kernel restructured the same API.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const dirs = [
  'packages/api/session-controller',
  'packages/client/ui-session',
  'packages/client/ui-layout',
  'packages/guard/spend-limit',
  'apps/desktop/src',
]
for (const dir of dirs) {
  try {
    execFileSync('git', ['rm', '-r', '-q', '--cached', dir], { stdio: 'ignore' })
  } catch {}
  execFileSync('powershell', ['-NoProfile', '-Command', `if (Test-Path '${dir}') { Remove-Item -Recurse -Force '${dir}' }`])
  execFileSync('git', ['checkout', ours, '--', dir], { stdio: 'ignore' })
  console.log(`restored ${dir} (${existsSync(dir) ? 'ok' : 'missing'})`)
}
