/** Test-only process peer; IPC barriers hold reservations until both admissions are observed. */
import { once } from 'node:events'
import { SpendLedger } from '../../src/ledger.ts'

const path = process.argv[2]
if (path === undefined || process.send === undefined) throw new Error('ledger fixture requires a path and IPC')
const ledger = await SpendLedger.open(path)
try {
  const request = once(process, 'message')
  process.send('ready')
  await request
  const result = ledger.reserve(4_000_000)
  const finish = once(process, 'message')
  process.send(result.kind)
  await finish
  if (result.kind === 'reserved') ledger.settle(result.id, 0)
} finally { ledger.close(); process.disconnect() }
