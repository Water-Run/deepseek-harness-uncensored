/** Isolate update delivery, inspector allocation and unexpected fatal reporting for main-entry qualification. */
import { DesktopUpdateCoordinator as Coordinator } from '../../lib/types/update-coordinator.js'
import { DesktopHostProcess as Host } from '../../lib/types/host-process.js'
import { DesktopFatalRecovery as Recovery } from '../../lib/types/fatal-recovery.js'
import { DesktopBackendController as Backend } from '../../lib/types/backend-controller.js'
export { DesktopHostFatalError, DesktopHostUncleanExitError } from '../../lib/types/host-process.js'
export { DesktopUpdatePreparationError } from '../../lib/types/update-error.js'

export const fixture = { updater: undefined, readUpdateSource: undefined, windowsHandoff: undefined, coordinator: undefined, host: undefined,
  ready: Promise.withResolvers(), failed: Promise.withResolvers(), fatalFailure: undefined,
  readyHosts: new WeakSet(), states: [], installations: [], taskQueries: [], backendStates: [], hostStarts: [] }
export class DesktopBackendController extends Backend {
  constructor(create, publish) {
    super(create, state => { fixture.backendStates.push({ at: Date.now(), phase: state.phase }); publish(state) })
  }
}
/** Unexpected fatal recovery fails the automated exercise instead of opening an operator dialog. */
export class DesktopFatalRecovery extends Recovery {
  get active() { return fixture.fatalFailure !== undefined }
  async report(error, source) {
    if (fixture.fatalFailure !== undefined) return
    fixture.fatalFailure = { error, source }
    fixture.failed.resolve(fixture.fatalFailure)
  }
}
export class DesktopUpdateCoordinator extends Coordinator {
  constructor(publish, beforeRestart, _updater, _enabled, _version, _downloadResult, _channel, _discard, _readSource, prepareHandoff) {
    super(state => { fixture.states.push(state); return publish(state) },
      beforeRestart, fixture.updater, () => true, () => '0.1.5-rc.1', undefined, 'nightly', undefined,
      fixture.readUpdateSource, prepareHandoff, fixture.windowsHandoff)
    fixture.coordinator = this
  }
}
export class DesktopHostProcess extends Host {
  async updateTasks(action) {
    const result = await super.updateTasks(action)
    fixture.taskQueries.push({ at: Date.now(), action, active: result })
    return result
  }
  constructor(node, runtime, project, _inspectPort, environment, onFailure, primaryRuntime, packageManager) {
    // Port zero lets the OS allocate the development inspector; no fixed listener is acquired.
    super(node, runtime, project, 0, environment, onFailure, primaryRuntime, packageManager)
    fixture.host = this
  }
  async start() {
    const record = { startedAt: Date.now() }
    fixture.hostStarts.push(record)
    try {
      const result = await super.start()
      record.readyAt = Date.now()
      fixture.readyHosts.add(this)
      fixture.ready.resolve(result.url)
      return result
    } catch (error) { record.failedAt = Date.now(); fixture.ready.reject(error); throw error }
  }
}
