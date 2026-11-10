/** Run Desktop update fixtures in a disposable Electron profile. */
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const modes = args.filter(option => ['--transport-only', '--hidden-windows', '--theme-only'].includes(option))
if (modes.length > 1) throw new Error('Select at most one local updater qualification mode')
const themeOnly = modes[0] === '--theme-only'
if (!themeOnly && process.platform !== 'win32') throw new Error('Local NSIS updater qualification requires Windows')
const runtime = args.find(option => option.startsWith('--electron='))
const executable = runtime === undefined ? (await import('electron')).default : resolve(runtime.slice('--electron='.length))
const fixture = themeOnly ? 'update-theme.mjs' : 'local-updater.mjs'
const temporary = await realpath(tmpdir())
const root = await mkdtemp(join(temporary, 'dsh-local-updater-'))
let timedOut = false
try {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^ELECTRON_RUN_AS_NODE$/iu.test(name)))
  const child = spawn(executable, [fileURLToPath(new URL(`../tests/fixtures/${fixture}`, import.meta.url)), ...modes], {
    env: { ...environment, DSH_LOCAL_UPDATE_TEST_ROOT: root }, stdio: 'inherit', windowsHide: true,
  })
  const timeout = setTimeout(() => { timedOut = true; child.kill() }, 120_000)
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    if (timedOut) throw new Error('Local updater qualification exceeded its 120-second deadline')
    if (result.signal !== null) throw new Error(`Electron exited on ${result.signal}`)
    if (result.code !== 0) throw new Error(`Local updater qualification failed: exit=${result.code}`)
    JSON.parse(await readFile(join(root, 'result.json'), 'utf8'))
    const evidenceRoot = fileURLToPath(new URL('../.desktop-build/qualification/', import.meta.url))
    await mkdir(evidenceRoot, { recursive: true })
    const evidence = await mkdtemp(join(evidenceRoot, themeOnly ? 'update-theme-' : 'local-updater-'))
    const screenshots = (await readdir(root, { withFileTypes: true }))
      .filter(file => file.isFile() && file.name.endsWith('.png')).map(file => file.name)
    for (const name of ['result.json', ...screenshots]) await copyFile(join(root, name), join(evidence, name))
    console.log(`${themeOnly ? 'Update theme' : 'Local updater'} evidence: ${evidence}`)
  } finally { clearTimeout(timeout) }
} finally {
  const checked = await realpath(root)
  if (checked !== root || dirname(checked) !== temporary) throw new Error('Unexpected updater fixture directory')
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
