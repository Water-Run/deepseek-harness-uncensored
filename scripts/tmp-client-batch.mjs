import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const git = (...args) => execFileSync('git', args, { stdio: 'ignore' })

for (const dir of ['packages/client/ui-tool', 'packages/client/ui-subagent', 'packages/client/ui-workflow-run']) {
  try { git('rm', '-r', '-q', '--cached', dir) } catch {}
  rmSync(dir, { recursive: true, force: true })
  git('checkout', ours, '--', dir)
}

// Referenced projects must be composite.
const hmr = 'packages/client/hmr/tsconfig.json'
const hmrConfig = JSON.parse(readFileSync(hmr, 'utf8'))
hmrConfig.compilerOptions = { ...hmrConfig.compilerOptions, composite: true }
writeFileSync(hmr, `${JSON.stringify(hmrConfig, null, 2)}\n`)

// Client programs that reach host declarations need the node ambient types.
const base = readFileSync('tsconfig.base.client.json', 'utf8')
if (!base.includes('"node"')) {
  writeFileSync('tsconfig.base.client.json', base.replace('"types": ["client-build-environment", "client-assets"]', '"types": ["client-build-environment", "client-assets", "node"]'))
}
console.log('restored UI packages, marked hmr composite, enabled node types for client programs')
