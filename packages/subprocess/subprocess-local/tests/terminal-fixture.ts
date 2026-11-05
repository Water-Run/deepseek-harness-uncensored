/** Instance-owned PTY and process-table fixtures for terminal lifecycle tests. */
import { vi, type Mock } from 'vitest'
import type { IDisposable, IPty } from 'node-pty'
import type { ProcessInspector, ProcessIdentity, ProcessSnapshot } from '../src/process-inspector.ts'
import type { SubprocessTerminalSignal } from '@deepseek-ai/dsh-subprocess'
export class FakePty implements IPty {
  pid = 123
  readonly cols = 80
  readonly rows = 24
  readonly process = 'fixture-shell'
  handleFlowControl = false
  readonly clear: Mock<IPty['clear']> = vi.fn()
  readonly pause: Mock<IPty['pause']> = vi.fn()
  readonly resume: Mock<IPty['resume']> = vi.fn()
  readonly resize: Mock<IPty['resize']> = vi.fn()
  readonly writes: string[] = []
  readonly kills: string[] = []
  autoExitOnKill = true
  throwKill = false
  onKill?: () => void
  private readonly dataListeners = new Set<(data: string) => void>()
  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>()

  readonly onData = (listener: (data: string) => void): IDisposable => {
    this.dataListeners.add(listener)
    return { dispose: () => { this.dataListeners.delete(listener) } }
  }

  readonly onExit = (listener: (event: { exitCode: number; signal?: number }) => void): IDisposable => {
    this.exitListeners.add(listener)
    return { dispose: () => { this.exitListeners.delete(listener) } }
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data)
  }

  emitExit(exitCode = 0, signal?: number): void {
    for (const listener of this.exitListeners) listener({ exitCode, ...signal === undefined ? {} : { signal } })
  }

  write(data: string): void { this.writes.push(data) }

  kill(signal?: string): void {
    if (this.throwKill) throw new Error('process raced')
    this.kills.push(signal ?? 'SIGHUP')
    this.onKill?.()
    if (this.autoExitOnKill) this.emitExit(0, signal === 'SIGKILL' ? 9 : 15)
  }

  asPty(): IPty {
    return this
  }
}

export class FakeInspector implements ProcessInspector {
  pgid: number | undefined = 456
  waiting = false
  /** The shell's own row, present like the real /proc- and ps-backed scans; tests recycle or drop it. */
  root: ProcessIdentity | undefined = { pid: 123, started: 'shell' }
  members: ProcessIdentity[] = []
  sessionMembers: ProcessIdentity[] = []
  readonly alive = new Set<number>()
  readonly groups: Array<[number, SubprocessTerminalSignal]> = []
  readonly processes: Array<[number, 'SIGTERM' | 'SIGKILL']> = []
  readonly stdinChecks: Array<[number, number]> = []
  throwGroup = false
  throwProcess = false
  removeOnSignal = true

  foregroundPgid() { return this.pgid }
  isStdinWaiting(pgid: number, shellPid: number) {
    this.stdinChecks.push([pgid, shellPid])
    return this.waiting
  }
  /** Per-question table reads; tests replace one to stage a scan without rebuilding the fake. */
  readTree: () => ProcessIdentity[] = () => this.root === undefined ? this.members : [this.root, ...this.members]
  readSession: () => ProcessIdentity[] = () => this.sessionMembers
  readAlive: (identity: ProcessIdentity) => boolean = identity => this.alive.has(identity.pid)
  /** Liveness as of right now; tests diverge it from readAlive to stage an exit between scan and signal. */
  readCurrentAlive: (identity: ProcessIdentity) => boolean = identity => this.readAlive(identity)
  /** Counts process-table captures so read-amplification cases can pin them. */
  captures = 0
  complete = true

  snapshot(): ProcessSnapshot {
    this.captures += 1
    return {
      complete: this.complete,
      tree: () => this.readTree(),
      session: () => this.readSession(),
      alive: identity => this.readAlive(identity),
    }
  }

  isAlive(identity: ProcessIdentity) { return this.readCurrentAlive(identity) }
  signalGroup(pgid: number, signal: SubprocessTerminalSignal) {
    if (this.throwGroup) throw new Error('group failed')
    this.groups.push([pgid, signal])
  }
  signalProcess(identity: ProcessIdentity, signal: 'SIGTERM' | 'SIGKILL') {
    // Mirrors the real inspectors' alive-gated signalling.
    if (this.throwProcess) throw new Error('process raced')
    if (!this.isAlive(identity)) return
    this.processes.push([identity.pid, signal])
    if (this.removeOnSignal) this.alive.delete(identity.pid)
  }
}
