/** Trusted test bootstrap: reports kernel identity before accepting any workload command. @module */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import koffi from 'koffi'

const kernel = koffi.load('kernel32.dll')
const current = kernel.func('void * GetCurrentProcess()')
const times = kernel.func('int GetProcessTimes(void *, void *, void *, void *, void *)')
const created = Buffer.alloc(8)
if (!times(current(), created, Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8))) throw new Error('GetProcessTimes failed')
process.stdout.write(`${JSON.stringify({ nonce: process.argv[2], pid: process.pid, creationTime: String(created.readBigUInt64LE()) })}\n`)
const input = createInterface({ input: process.stdin })
for await (const command of input) {
  if (command === 'exit') process.exit(0)
  if (command !== 'start') throw new Error('Unknown test command')
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000); process.send("ready")'], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'], detached: true, windowsHide: true,
  })
  await once(child, 'message')
  child.disconnect()
  child.unref()
  process.stdout.write(`${JSON.stringify({ child: child.pid })}\n`)
}
