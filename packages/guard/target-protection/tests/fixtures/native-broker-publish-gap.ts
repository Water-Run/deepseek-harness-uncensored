/** Test-only broker that holds SDK startup after process creation but before returning its handle. @module */
import { writeFile } from 'node:fs/promises'
import { probe, spawn } from '@microsoft/mxc-sdk/v1'
import { runNativeBroker } from '../../src/native-broker.ts'

const marker = process.env.DSHU_TEST_NATIVE_MARKER
if (marker === undefined) throw new Error('Missing private startup marker')
await runNativeBroker(process.stdin, process.stdout, process.stderr, async () => ({
  probe,
  async spawn(request, options) {
    const child = await spawn(request, options)
    await writeFile(marker, String(child.id))
    const held = setInterval(() => {}, 1000)
    try { await new Promise<never>(() => {}) }
    finally { clearInterval(held) }
    return child
  },
}))
