import { readFileSync, writeFileSync } from 'node:fs'

const path = 'packages/guard/target-protection/src/ptc.ts'
let text = readFileSync(path, 'utf8')

text = text.replace(
  "function failure(kind: NonNullable<PtcRunResult['error']>['kind'], message: string, logs: string[] = []): PtcRunResult {\n  return { logs, error: { kind, message } }\n}",
  "function failure(kind: NonNullable<PtcRunResult['error']>['kind'], message: string, logs: string[] = []): PtcRunResult {\n  return { output: logs.map(log => ({ type: 'text', text: log })), error: { kind, message } }\n}",
)

// The provider result carries typed output fragments rather than plain log lines.
text = text.replaceAll('return { logs, value }', "return { output: logs.map(log => ({ type: 'text', text: log })), value }")
writeFileSync(path, text)
console.log('adapted PtcRunResult output')
