/** Private subprocess entry; the caller must establish strict outer Job ownership before launching it. @module */
import { runNativeBroker } from './native-broker.ts'

if (import.meta.main) {
  try { await runNativeBroker(process.stdin, process.stdout, process.stderr) }
  catch (error) {
    console.error('Native broker failed:', error)
    process.exitCode = 127
  }
}
