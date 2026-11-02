/** Private subprocess entry; the caller must establish strict outer Job ownership before launching it. @module */
import { runNativeBroker } from './native-broker.ts'

if (import.meta.main) {
  try { await runNativeBroker(process.stdin, process.stdout, process.stderr) }
  catch (error) {
    process.stderr.write(`Native broker failed: ${error instanceof Error ? error.message : 'unknown failure'}\n`)
    process.exitCode = 127
  }
}
