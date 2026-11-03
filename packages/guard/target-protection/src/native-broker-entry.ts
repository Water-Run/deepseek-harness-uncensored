/** Private subprocess entry; the caller must establish strict outer Job ownership before launching it. @module */
import { runNativeBroker } from './native-broker.ts'

if (import.meta.main) {
  runNativeBroker(process.stdin, process.stdout, process.stderr).catch((error: unknown) => {
    console.error('Native broker failed:', error)
    process.exitCode = 127
  })
}
