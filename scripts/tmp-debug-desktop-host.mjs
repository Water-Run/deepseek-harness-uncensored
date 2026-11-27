import { fork } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const repo = 'D:/Coding/kernel-merge'
const project = process.argv[2]
const runtimeArg = process.argv[3]
const child = fork(`${repo}/apps/desktop-host/src/index.ts`, [runtimeArg, project, ''], {
  execArgv: ['--import', 'tsx/esm'],
  cwd: repo,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
const log = []
child.stdout?.on('data', chunk => { log.push(`stdout: ${chunk}`) })
child.stderr?.on('data', chunk => { log.push(`stderr: ${chunk}`) })
child.on('message', message => {
  log.push(`ipc: ${JSON.stringify(message).slice(0, 400)}`)
  if (message?.type === 'starting') child.send({ type: 'desktop-auth', secret: randomBytes(32).toString('base64url') })
})
const timer = setTimeout(() => {
  console.log(log.join('\n').slice(-6000))
  console.log('--- still running after 90s ---')
  child.kill()
}, 90_000)
child.on('exit', code => {
  clearTimeout(timer)
  console.log(log.join('\n').slice(-6000))
  console.log(`--- exited ${String(code)} ---`)
})
