import { afterEach, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { SpendGate } from '../src/gate.ts'
import { SpendLedger, MICRO_CNY } from '../src/ledger.ts'
import type { SpendPauseClaim } from '../src/ledger.ts'
import { SpendRecovery } from '../src/continuation.ts'
import { DEFAULT_RATES } from '../src/pricing.ts'

const owned: { recovery: SpendRecovery; gate: SpendGate }[] = []
afterEach(async () => { for (const { recovery, gate } of owned.splice(0)) { await recovery.close(); await gate.close() } })

async function fixture() {
  const ledger = await SpendLedger.open(':memory:')
  const gate = new SpendGate(ledger, DEFAULT_RATES, 50, () => true)
  const report = vi.fn()
  const recovery = new SpendRecovery(report)
  owned.push({ recovery, gate })
  const id = ledger.waitForSession(SessionId('paused'), MICRO_CNY)
  ledger.blockSession(id)
  return { ledger, gate, recovery, report, id }
}

it('leaves records durable without a provider, on unavailable sessions, and on reported failures', async () => {
  const { ledger, gate, recovery, report, id } = await fixture()
  await recovery.flush(gate)
  expect(ledger.snapshot().pausedSessions).toHaveLength(1)
  const handler = vi.fn(async () => 'unavailable' as const)
  const remove = recovery.register(handler, () => true)
  await recovery.flush(gate)
  expect(handler).toHaveBeenCalledWith({ id, sessionId: 'paused' }, expect.any(AbortSignal))
  expect(ledger.snapshot().pausedSessions).toHaveLength(1)
  handler.mockRejectedValueOnce(new Error('restore failed'))
  await recovery.flush(gate)
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'restore failed' }))
  expect(ledger.snapshot().pausedSessions).toHaveLength(1)
  await remove()
  recovery.register(async () => 'missing', () => true)
  await recovery.flush(gate)
  expect(ledger.snapshot().pausedSessions).toEqual([])
})

it('serializes recovery and drains a cancelled provider before releasing the ledger', async () => {
  const { ledger, gate, recovery } = await fixture()
  const entered = Promise.withResolvers<undefined>(), released = Promise.withResolvers<undefined>()
  const handler = vi.fn(async (_claim: SpendPauseClaim, signal: AbortSignal) => {
    entered.resolve(undefined)
    await released.promise
    signal.throwIfAborted()
    return 'missing' as const
  })
  const remove = recovery.register(handler, () => true)
  const first = recovery.flush(gate)
  let removing: Promise<void> | undefined
  try {
    await vi.waitFor(() => { expect(handler).toHaveBeenCalledOnce() })
    await entered.promise
    expect(recovery.flush(gate)).toBe(first)
    let removed = false
    removing = remove().then(() => { removed = true })
    await Promise.resolve()
    expect(removed).toBe(false)
    expect(ledger.snapshot().pausedSessions).toHaveLength(1)
  } finally { released.resolve(undefined); await removing; await first }
  expect(handler).toHaveBeenCalledOnce()
  expect(ledger.snapshot().pausedSessions).toHaveLength(1)
  expect(ledger.claimBlockedSessions()).toHaveLength(1)
})
