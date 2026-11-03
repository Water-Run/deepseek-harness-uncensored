/** Exercise the shipped ConPTY addon in a fresh process under an extended-length path. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdtempSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify, stripVTControlCharacters } from 'node:util'

const [operation, root] = process.argv.slice(2)
assert.equal(process.platform, 'win32')
assert.ok(root)
// Electron's cpSync extracts one ASAR file and cannot copy a virtual directory.
function copyEntry(source, destination) {
  if (statSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true })
    for (const name of readdirSync(source)) copyEntry(join(source, name), join(destination, name))
  } else copyFileSync(source, destination)
}
if (operation === 'copy') {
  const scratch = mkdtempSync(join(tmpdir(), 'dshu-conpty-'))
  try {
    let directory = scratch
    while (directory.length < 280) directory = join(directory, 'terminal-long-path-'.repeat(3))
    directory = join(directory, '中文 安装目录', 'node-pty')
    mkdirSync(directory, { recursive: true })
    for (const item of ['lib', `prebuilds/win32-${process.arch}`, 'package.json']) {
      copyEntry(join(root, item), join(directory, item))
    }
    const result = await promisify(execFile)(process.execPath, [import.meta.filename, 'run', directory], {
      windowsHide: true, timeout: 30_000, env: process.env,
    })
    process.stdout.write(result.stdout)
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
} else {
  assert.equal(operation, 'run')
  assert.ok(join(root, 'prebuilds', `win32-${process.arch}`, 'conpty', 'conpty.dll').length > 300)
  const pty = createRequire(join(root, 'package.json'))('./lib/index.js')
  const terminal = pty.spawn(process.env.ComSpec, ['/d', '/q'], {
    cwd: tmpdir(), env: process.env, cols: 120, rows: 24, useConptyDll: true,
  })
  let output = ''
  let timedOut = false
  const data = terminal.onData(value => { output += value })
  let subscription
  const exit = new Promise(resolve => { subscription = terminal.onExit(resolve) })
  const timer = setTimeout(() => { timedOut = true; terminal.kill() }, 20_000)
  try {
    terminal.write('echo dshu-long-path-terminal-ok\r')
    terminal.write('exit\r')
    const result = await exit
    assert.equal(timedOut, false, 'ConPTY must exit before the deadline')
    assert.equal(result.exitCode, 0)
    assert.ok(result.signal === undefined || result.signal === 0)
    assert.match(stripVTControlCharacters(output), /(?:^|\r?\n)dshu-long-path-terminal-ok\r?\n/u)
    console.log(`runtime payload: ConPTY long path (${root.length} characters), input/output/exit passed`)
  } finally {
    clearTimeout(timer)
    data.dispose()
    terminal.kill()
    await exit
    subscription.dispose()
  }
}
