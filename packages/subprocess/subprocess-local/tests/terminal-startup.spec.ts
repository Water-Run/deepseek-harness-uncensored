/** Asynchronous ConPTY identity publication, buffering and cancellation on every host. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalTerminalHandle } from '../src/terminal.ts'
import { FakePty, FakeInspector } from './terminal-fixture.ts'
afterEach(() => { vi.useRealTimers() })
const makeHandle = (pty: FakePty, inspector: FakeInspector, graceMs: number) =>
  new LocalTerminalHandle(pty.asPty(), inspector, graceMs, 'linux')
describe('terminal startup', () => {
  it('waits for an asynchronous PID, preserves early output and captures only that identity', async () => {
    vi.useFakeTimers()
    const pty = new FakePty(), inspector = new FakeInspector()
    pty.pid = 0
    const handle = makeHandle(pty, inspector, 10)
    try {
      let ready = false
      const starting = handle.waitForStart().then(() => { ready = true })
      await vi.advanceTimersByTimeAsync(1)
      expect(ready).toBe(false)
      expect(inspector.captures).toBe(0)
      pty.pid = 123
      pty.emitData('startup output')
      await vi.advanceTimersByTimeAsync(1)
      await starting
      expect(handle.pid).toBe(123)
      expect(inspector.captures).toBe(1)
      expect(handle.output.read()).toEqual(Buffer.from('startup output'))
      pty.pid = 999
      expect(handle.pid).toBe(123)
    } finally { pty.emitExit(); await handle.terminate() }
  })

  it('cancels an unpublished startup without capturing PID zero', async () => {
    const pty = new FakePty(), inspector = new FakeInspector(), caller = new AbortController()
    pty.pid = 0
    const handle = makeHandle(pty, inspector, 10)
    try {
      const starting = handle.waitForStart(caller.signal)
      const reason = new Error('cancel startup')
      caller.abort(reason)
      await expect(starting).rejects.toBe(reason)
      expect(inspector.captures).toBe(0)
    } finally { pty.emitExit(); await handle.terminate() }
  })

  it('refuses an allocation that exits before publishing its PID', async () => {
    const pty = new FakePty(), inspector = new FakeInspector()
    pty.pid = 0
    const handle = makeHandle(pty, inspector, 10)
    try {
      const starting = handle.waitForStart()
      pty.emitExit(1)
      await expect(starting).rejects.toThrow('before starting')
      expect(inspector.captures).toBe(0)
    } finally { await handle.terminate() }
  })

  it('refuses publication after cleanup even if the backend later exposes a PID', async () => {
    const pty = new FakePty(), inspector = new FakeInspector()
    pty.pid = 0
    const handle = makeHandle(pty, inspector, 10)
    try {
      const starting = handle.waitForStart()
      const rejected = expect(starting).rejects.toThrow('closed during startup')
      await handle.terminate()
      pty.pid = 123
      await rejected
      expect(handle.running).toBe(false)
    } finally { await handle.terminate() }
  })

  it('does not adopt a later identity after the first process snapshot was unavailable', async () => {
    const pty = new FakePty(), inspector = new FakeInspector()
    inspector.root = undefined
    const handle = makeHandle(pty, inspector, 10)
    try {
      inspector.root = { pid: 123, started: 'reused' }
      await handle.waitForStart()
      expect(inspector.captures).toBe(1)
    } finally { pty.emitExit(); await handle.terminate() }
  })

})
