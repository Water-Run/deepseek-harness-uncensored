/** Managed-range building blocks for confined providers that own their transport and outer lifecycle. @module */
export { launchWindowsJob } from './windows-job.ts'
export { bindManagedProcess, validateSubprocessSpec } from './spawn.ts'
export type { BoundProcessOwner, ManagedProcessLaunch } from './managed-owner.ts'
export { targetEnvironment } from './runner-launch.ts'
