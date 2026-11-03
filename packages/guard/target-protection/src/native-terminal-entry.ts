/** Private contained terminal helper; the outer Job owns every descendant and remains authoritative after exit. @module */
import { openInheritedControlChannel } from '@deepseek-ai/dsh-subprocess/control'
import { runNativeTerminalWorker } from './native-terminal-worker.ts'

/* v8 ignore start -- Source and compiled contained-process tests cover this executable-only descriptor/exit glue. */
async function main(): Promise<void> {
  const channel = openInheritedControlChannel()
  channel.on('error', () => { /* The worker reports failures; late descriptor closure must not bypass the entry's exit. */ })
  let status = 0
  try { await runNativeTerminalWorker(channel) }
  catch (error) { console.error('Native terminal helper failed:', error); status = 127 }
  // ConPTY can retain native I/O handles after shell exit. Flush acknowledgements before ending this owned helper.
  if (channel.destroyed) process.exit(status)
  channel.end(() => { process.exit(status) })
}
if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('Native terminal helper failed:', error)
    process.exitCode = 127
  })
}
/* v8 ignore stop */
