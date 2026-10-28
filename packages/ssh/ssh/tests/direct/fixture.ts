/** Vitest ownership of the shared disposable SSH peer. @module */
import { onTestFinished } from 'vitest'
import { createSshFixture } from './peer.ts'
export { hello } from './peer.ts'

/** @param options - Peer behavior for this test. @returns A fixture released even when assertions fail. */
export async function harness(options: Parameters<typeof createSshFixture>[0] = {}) {
  const fixture = await createSshFixture(options)
  onTestFinished(() => fixture.close())
  return fixture
}
