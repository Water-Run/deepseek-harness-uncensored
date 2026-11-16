/** Qualification success requires completed scenarios rather than a zero process exit. */
import { expect, it } from 'vitest'
import complete from './expected/workspace-update-complete.json' with { type: 'json' }
import { validateWorkspaceUpdateResult } from '../scripts/workspace-update-result.ts'

it('accepts all completed automatic workspace recovery scenarios', () => {
  expect(() => { validateWorkspaceUpdateResult(complete, false) }).not.toThrow()
})

it.each([undefined, null, {}])('rejects an early exit with no completion report: %j', (value) => {
  expect(() => { validateWorkspaceUpdateResult(value, false) }).toThrow()
})

it('rejects a partial scenario list', () => {
  expect(() => { validateWorkspaceUpdateResult({ ...complete, cases: complete.cases.slice(0, -1) }, false) }).toThrow()
})

it('rejects a duplicate case in place of the missing scenario', () => {
  const cases = [...complete.cases.slice(0, -1), complete.cases[0]]
  expect(() => { validateWorkspaceUpdateResult({ ...complete, cases }, false) }).toThrow()
})

it.each([{ realHostProcess: false }, { installerExecuted: true }])('rejects scope violations: %j', (change) => {
  expect(() => { validateWorkspaceUpdateResult({ ...complete, ...change }, false) }).toThrow()
})

it('accepts a manual exercise record only as manual evidence', () => {
  const manual = { installerExecuted: false, interceptedInstallations: 0, phases: ['idle'] }
  expect(() => { validateWorkspaceUpdateResult(manual, true) }).not.toThrow()
  expect(() => { validateWorkspaceUpdateResult(manual, false) }).toThrow()
})
