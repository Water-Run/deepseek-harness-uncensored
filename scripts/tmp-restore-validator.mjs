import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const source = execFileSync('git', ['show', `${ours}:packages/ptc-runtime/ptc-runtime/src/index.ts`], { encoding: 'utf8' })
const start = source.indexOf('/**\n * Binding globals EVERY backend refuses')
const end = source.indexOf('declare module', start)
if (start < 0 || end < 0) throw new Error('validator block not found')
const block = source.slice(start, end).trimEnd()

const module = `/** Portable binding-name validation shared by providers that start their own interpreter. */
import type { PtcBindingNamespace, PtcRunRequest } from './types.ts'

${block
  .replace(/export const /g, 'export const ')
  .replace(/export function validatePtcBindings/, 'export function validatePtcBindings')}
`
writeFileSync('packages/ptc-runtime/ptc-runtime/src/validate-bindings.ts', module)

const indexPath = 'packages/ptc-runtime/ptc-runtime/src/index.ts'
let index = readFileSync(indexPath, 'utf8')
if (!index.includes('validate-bindings.ts')) {
  index = index.replace(
    "export class PtcRuntimeError extends HarnessError {",
    "export { validatePtcBindings } from './validate-bindings.ts'\n\nexport class PtcRuntimeError extends HarnessError {",
  )
  writeFileSync(indexPath, index)
}
console.log('restored portable binding validator as a runtime export')
