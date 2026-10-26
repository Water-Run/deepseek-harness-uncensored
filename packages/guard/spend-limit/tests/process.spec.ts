import { expect, it } from 'vitest'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SpendLedger, DEFAULT_PREFERENCES } from '../src/ledger.ts'

it('atomically excludes competing reservations from independent processes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-budget-process-'))
  const path = join(directory, 'spending.sqlite')
  const ledger = await SpendLedger.open(path)
  const peers: { child: ReturnType<typeof fork>; closed: Promise<[number | null, NodeJS.Signals | null]> }[] = []
  try {
    ledger.configure({ ...DEFAULT_PREFERENCES, enabledPeriods: ['15m', '1h', '5h', '1d', '7d', '30d'], autoResume: true })
    const started = [0, 1].map(() => {
      const child = fork(fileURLToPath(new URL('./fixtures/process-ledger.ts', import.meta.url)), [path], {
        execArgv: ['--import', 'tsx/esm'], env: { ...process.env, TSX_TSCONFIG_PATH: join(process.cwd(), 'tsconfig.base.json') }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      })
      const closed = new Promise<[number | null, NodeJS.Signals | null]>((resolve) => { child.once('exit', (code, signal) => { resolve([code, signal]) }) })
      peers.push({ child, closed })
      return once(child, 'message')
    })
    expect((await Promise.all(started)).map((reply): unknown => reply[0])).toEqual(['ready', 'ready'])
    const admitted = peers.map(({ child }) => { const reply = once(child, 'message'); child.send('reserve'); return reply })
    expect((await Promise.all(admitted)).map((reply): unknown => reply[0]).sort()).toEqual(['reserved', 'waiting'])
    expect(ledger.snapshot().windows[0]?.reserved).toBe(4)
    for (const { child } of peers) child.send('finish')
    expect(await Promise.all(peers.map(peer => peer.closed))).toEqual([[0, null], [0, null]])
    expect(ledger.snapshot().windows[0]?.reserved).toBe(0)
  } finally {
    for (const { child } of peers) if (child.exitCode === null && child.signalCode === null) child.kill()
    await Promise.all(peers.map(peer => peer.closed))
    ledger.close()
    await rm(directory, { recursive: true, force: true })
  }
})
