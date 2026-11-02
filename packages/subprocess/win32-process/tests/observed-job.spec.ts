/** Native ownership refuses PID reuse, incomplete observations and premature handle release. @module */
import { afterEach, expect, it, vi } from 'vitest'
import * as timers from 'node:timers/promises'
import { readFileSync, statSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachObservedWindowsJob, currentWindowsProcessIdentity, observedWindowsBootstrapPath } from '../src/observed-job.ts'
import type { ObservedJobBindings, WindowsProcessIdentity } from '../src/observed-job.ts'
import type { NativePtr } from '../src/ffi.ts'
import * as abi from '../src/abi.ts'

vi.mock('node:timers/promises', async (original) => {
  const actual = await original<typeof timers>()
  return { ...actual, setTimeout: vi.fn(actual.setTimeout) }
})

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('resolves a bootstrap asset included in the published package', () => {
  const manifest = fileURLToPath(new URL('../package.json', import.meta.url))
  const value: unknown = JSON.parse(readFileSync(manifest, 'utf8'))
  const asset = observedWindowsBootstrapPath()
  expect(statSync(asset).isFile()).toBe(true)
  if (typeof value !== 'object' || value === null || !('files' in value) || !Array.isArray(value.files)) {
    throw new Error('The package must declare its published files')
  }
  expect(value.files).toContain(relative(dirname(manifest), asset).replaceAll('\\', '/'))
})

function fixture() {
  const root = 10n as NativePtr, job = 20n as NativePtr
  const calls: string[] = [], state = { active: 1, created: 42n, fail: '' }
  const closedFailures = new Set<NativePtr>()
  const api: Partial<ObservedJobBindings> = {
    getLastError: () => 5, formatMessageW: () => 0,
    getCurrentProcess: () => root,
    openProcess: (_access, _inherit, pid) => { calls.push(`open:${pid}`); return state.fail === 'open' ? null : root },
    getProcessTimes: (_process, created) => { calls.push('identity'); created.writeBigUInt64LE(state.created); return state.fail === 'identity' ? 0 : 1 },
    createJobObjectW: () => { calls.push('create'); return state.fail === 'create' ? 0n as NativePtr : job },
    setInformationJobObject: (_job, cls, bytes) => {
      calls.push('limits')
      expect(cls).toBe(abi.JobObjectExtendedLimitInformation)
      expect(bytes.readUInt32LE(abi.JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET)).toBe(abi.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
      return state.fail === 'limits' ? 0 : 1
    },
    assignProcessToJobObject: () => { calls.push('assign'); return state.fail === 'assign' ? 0 : 1 },
    queryInformationJobObject: (_job, _cls, output) => {
      calls.push('observe'); output.writeUInt32LE(state.active, abi.JOBOBJECT_BASIC_ACCOUNTING_ACTIVE_PROCESSES_OFFSET)
      return state.fail === 'observe' ? 0 : 1
    },
    terminateJobObject: () => { calls.push('terminate'); return state.fail === 'terminate' ? 0 : 1 },
    closeHandle: (handle) => { calls.push(`close:${handle}`); return closedFailures.has(handle) ? 0 : 1 },
  }
  // The injected table supplies only the calls reached by this owner; Windows integration checks the real ABI.
  return { api: api as ObservedJobBindings, state, calls, closedFailures, root, job,
    identity: { pid: 123, creationTime: 42n } satisfies WindowsProcessIdentity }
}

it('borrows an active Job without transferring ownership and refuses ended references', () => {
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  expect(job.borrowHandle()).toBe(20n)
  expect(h.calls.some(call => call.startsWith('close:'))).toBe(false)
  h.state.active = 0
  expect(() => job.borrowHandle()).toThrow(expect.objectContaining({ code: 'already-exited' }))
  job.close()
  expect(() => job.borrowHandle()).toThrow(expect.objectContaining({ code: 'already-exited' }))
})

it('captures the current process creation time without closing a pseudo-handle', () => {
  const h = fixture()
  expect(currentWindowsProcessIdentity(h.api)).toEqual({ pid: process.pid, creationTime: 42n })
  expect(h.calls).toEqual(['identity'])
})

it.each([
  { pid: 0, creationTime: 1n }, { pid: 1.5, creationTime: 1n }, { pid: 0x1_0000_0000, creationTime: 1n },
  { pid: 123, creationTime: 0n }, { pid: 123, creationTime: 0x1_0000_0000_0000_0000n },
])('rejects an invalid native identity before opening a process', (identity) => {
  const h = fixture()
  expect(() => attachObservedWindowsJob(identity, h.api)).toThrow(expect.objectContaining({ code: 'invalid-identity' }))
  expect(h.calls).toEqual([])
})

it('does not assign or terminate a reused PID', () => {
  const h = fixture(); h.state.created = 43n
  expect(() => attachObservedWindowsJob(h.identity, h.api)).toThrow(expect.objectContaining({ code: 'identity-changed' }))
  expect(h.calls).toEqual(['open:123', 'identity', 'close:10'])
})

it.each(['open', 'identity', 'create', 'limits', 'assign'])('releases every acquired handle when %s fails', (failure) => {
  const h = fixture(); h.state.fail = failure
  expect(() => attachObservedWindowsJob(h.identity, h.api)).toThrow()
  expect(h.calls.filter(call => call.startsWith('close:'))).toEqual(failure === 'open' ? []
    : ['identity', 'create'].includes(failure) ? ['close:10'] : ['close:20', 'close:10'])
  expect(h.calls).not.toContain('terminate')
})

it('attempts both setup cleanup operations when one close fails', () => {
  const h = fixture(); h.state.fail = 'assign'; h.closedFailures.add(h.job)
  expect(() => attachObservedWindowsJob(h.identity, h.api)).toThrow(AggregateError)
  expect(h.calls.slice(-2)).toEqual(['close:20', 'close:10'])
})

it('rejects release while active and keeps zero-member evidence after release', async () => {
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  expect(() => { job.close() }).toThrow(expect.objectContaining({ code: 'still-running' }))
  expect(h.calls.some(call => call.startsWith('close:'))).toBe(false)
  job.terminate(1)
  expect(job.isEmpty()).toBe(false)
  h.state.active = 0
  expect(await job.waitForExit(5)).toBe(true)
  job.close(); job.close(); job.terminate(1)
  expect(job.isEmpty()).toBe(true)
  expect(await job.waitForExit(5, AbortSignal.abort())).toBe(true)
  expect(h.calls.filter(call => call.startsWith('close:'))).toEqual(['close:20', 'close:10'])
})

it('does not treat cancelled observation as native exit', async () => {
  vi.useFakeTimers()
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api), abort = new AbortController()
  expect(await job.waitForExit(5, AbortSignal.abort())).toBe(false)
  const waiting = job.waitForExit(5, abort.signal)
  abort.abort()
  expect(await waiting).toBe(false)
  expect(() => { job.close() }).toThrow(expect.objectContaining({ code: 'still-running' }))
  h.state.active = 0; job.close()
})

it('observes later process exit instead of using elapsed time as proof', async () => {
  vi.useFakeTimers()
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  const waiting = job.waitForExit(5)
  await vi.advanceTimersByTimeAsync(5)
  expect(job.isEmpty()).toBe(false)
  h.state.active = 0
  await vi.advanceTimersByTimeAsync(5)
  expect(await waiting).toBe(true)
  job.close()
})

it.each([0, -1, NaN, 2147483648])('rejects invalid observation intervals', async (interval) => {
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  await expect(job.waitForExit(interval)).rejects.toThrow(RangeError)
  h.state.active = 0; job.close()
})

it('keeps observation and termination failures visible without releasing the range', async () => {
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  h.state.fail = 'observe'
  await expect(job.waitForExit(5)).rejects.toMatchObject({ api: 'QueryInformationJobObject' })
  job.terminate(1)
  expect(h.calls).toContain('terminate')
  h.state.fail = 'terminate'
  expect(() => { job.terminate(1) }).toThrow(expect.objectContaining({ api: 'TerminateJobObject' }))
  h.state.fail = ''; h.state.active = 0; job.close()
})

it('propagates a failed observation timer without treating it as native exit', async () => {
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  const failure = new Error('timer unavailable')
  vi.mocked(timers.setTimeout).mockRejectedValueOnce(failure)
  await expect(job.waitForExit(5)).rejects.toBe(failure)
  expect(() => { job.close() }).toThrow(expect.objectContaining({ code: 'still-running' }))
  h.state.active = 0; job.close()
})

it('reports cleanup failure after confirmed exit without reusing possibly closed handles', () => {
  const h = fixture(), job = attachObservedWindowsJob(h.identity, h.api)
  h.state.active = 0; h.closedFailures.add(h.job); h.closedFailures.add(h.root)
  expect(() => { job.close() }).toThrow(AggregateError)
  job.close(); job.terminate(1)
  expect(h.calls.slice(-2)).toEqual(['close:20', 'close:10'])
  expect(job.isEmpty()).toBe(true)
})
