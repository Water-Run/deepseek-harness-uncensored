/**
 * Shared fixture: a real local filesystem over a temp workspace plus the
 * minimal Host services the dossier service reads. The real backend, not a
 * fake `ctx.fs`, because the version guard under test is the backend's own and
 * a stub would pass a conflict test that the real write path would fail.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { ModeDossiers } from '../src/index.ts'

/** Workspace identity the fixture registers. */
export const WORKSPACE_ID = 'w-test'

/** Cancellation token every direct service call receives. */
export const signal = (): AbortSignal => new AbortController().signal

/** One temp workspace and the service serving it. */
export interface Harness {
  readonly workspace: string
  readonly ctx: Context
  readonly service: ModeDossiers
  dispose(): Promise<void>
}

/**
 * Create the workspace and a context with the local backend rooted at it.
 * @param prefix - temp directory prefix naming the suite.
 * @returns the harness; dispose it in `afterEach`.
 */
export async function openHarness(prefix: string): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const ctx = new Context()
  const fiber = await ctx.plugin(LocalFileSystem, { cwd: workspace })
  ctx.provide('workspaceRegistry', {
    get: (id: string) => (id === WORKSPACE_ID
      ? { id: WorkspaceId(WORKSPACE_ID), title: 'Fixture workspace', path: workspace }
      : undefined),
  } as never)
  const service = new ModeDossiers(ctx, { contextBytes: 4096, sampleBytes: 64 * 1024, maxCases: 50 })
  return {
    workspace,
    ctx,
    service,
    dispose: async () => {
      await fiber.dispose()
      await rm(root, { recursive: true, force: true })
    },
  }
}

/**
 * Await an operation expected to fail with a Remote error.
 * @param operation - the call under test.
 * @returns the Remote failure's code.
 */
export async function failureCodeOf(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') return error.code
    throw error
  }
  throw new Error('expected the operation to fail')
}
