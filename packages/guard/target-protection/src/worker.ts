/** Private Worker entry; parsing, evaluation and protocol behavior belong to the interpreter. @module */
import { parentPort, workerData } from 'node:worker_threads'
import { ptcBoot } from './ptc-protocol.ts'
import { runPtcInterpreter } from './ptc-engine.ts'

async function main(): Promise<void> {
  if (parentPort === null) throw new Error('QuickJS PTC requires its private Worker port')
  await runPtcInterpreter(ptcBoot.parse(workerData), parentPort)
}

void main().catch((error: unknown) => { queueMicrotask(() => { throw error }) })
