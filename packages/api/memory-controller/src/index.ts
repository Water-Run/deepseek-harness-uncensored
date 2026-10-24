/**
 * Host owner of the `memory` Remote namespace. Reads serve the management
 * page; every write requires the application owner and is version-checked, so
 * two windows cannot silently overwrite each other. Failures are raised as
 * typed `RemoteError`s carrying the identity and revisions the page needs to
 * recover.
 * @module @deepseek-ai/dsh-api-memory-controller
 */

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { MemoryConflictError, MemoryError } from '@deepseek-ai/dsh-memory'
import type { MemoryFilter, MemoryId, MemoryScope } from '@deepseek-ai/dsh-memory/types'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-workspace'
import type {
  MemoryCreateRequest,
  MemoryDescribeValue,
  MemoryListRequest,
  MemoryListValue,
  MemoryRemoveRequest,
  MemoryRemoveValue,
  MemoryScopeOption,
  MemoryStatusRequest,
  MemoryUpdateRequest,
  MemoryValue,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host service backing the generated `ctx.remote.memory` namespace. */
    memoryController: MemoryController
  }
}

/**
 * Translate one domain failure into its wire failure.
 * @param error - the thrown value.
 * @param memoryId - identity the request named, when it named one.
 * @returns never; always throws the translated failure.
 */
function raise(error: unknown, memoryId?: MemoryId): never {
  if (error instanceof MemoryConflictError) {
    throw new RemoteError('memory/conflict', error.message, {
      memoryId: error.memoryId,
      expectedVersion: error.expectedVersion,
      currentVersion: error.currentVersion,
    })
  }
  if (error instanceof MemoryError) {
    switch (error.code) {
      case 'not-found':
        throw new RemoteError('memory/not-found', error.message, {
          ...memoryId === undefined ? {} : { memoryId },
        })
      case 'invalid':
        throw new RemoteError('memory/invalid', error.message, { reason: error.message })
      case 'storage-unavailable':
        throw new RemoteError('memory/unavailable', error.message, { reason: error.message })
      default:
        throw error
    }
  }
  throw error
}

/**
 * Host service behind `ctx.remote.memory` (namespace `memory`). Reads are
 * open to the caller; management writes require the owner principal because
 * they change what every later conversation may be told.
 */
export class MemoryController extends TypertRemoteService {
  static inject = ['typert', 'remoteAccess', 'memory']

  /**
   * @param ctx - Host context carrying the memory service.
   */
  constructor(ctx: Context) {
    super(ctx, 'memoryController', { namespace: 'memory' })
  }

  /**
   * Report the exact bounds and the scope values the page may offer.
   * @returns retrieval limits, registered workspaces, and known mode ids.
   */
  @Remote('describe')
  describe(): MemoryDescribeValue {
    const workspaces: MemoryScopeOption[] = (this.ctx.get('workspaceRegistry')?.list() ?? []).map(workspace => ({
      value: `workspace:${workspace.id}`,
      label: workspace.title,
    }))
    const modes = new Map<string, MemoryScopeOption>()
    for (const record of this.ctx.memory.records()) {
      const mode = record.scope.mode
      if (mode !== undefined && !modes.has(mode)) modes.set(mode, { value: mode, label: mode })
    }
    return { limits: this.ctx.memory.limits(), workspaces, modes: [...modes.values()] }
  }

  /**
   * List stored records for the management page.
   * @param request - scope, classification, status, and text filters.
   * @returns matching records, most recently updated first.
   */
  @Remote('list')
  list(request: MemoryListRequest): MemoryListValue {
    return { records: this.ctx.memory.list(filterOf(request)) }
  }

  /**
   * Save one record from the management page.
   * @param request - classification, text, and scope.
   * @returns the stored record.
   */
  @Remote('create')
  async create(request: MemoryCreateRequest): Promise<MemoryValue> {
    this.assertOwner()
    try {
      const result = await this.ctx.memory.create({
        type: request.type,
        content: request.content,
        ...request.title === undefined ? {} : { title: request.title },
        ...request.topic === undefined ? {} : { topic: request.topic },
        scope: request.scope,
        source: { kind: 'user', confirmed: true },
      })
      return { record: result.record }
    } catch (error) {
      raise(error)
    }
  }

  /**
   * Edit one record under a version check.
   * @param request - identity, expected revision, and replacement fields.
   * @returns the stored record at its new revision.
   * @throws RemoteError `memory/conflict` when another window saved first.
   */
  @Remote('update')
  async update(request: MemoryUpdateRequest): Promise<MemoryValue> {
    this.assertOwner()
    try {
      return { record: await this.ctx.memory.update(request.id, request.patch, request.expectedVersion) }
    } catch (error) {
      raise(error, request.id)
    }
  }

  /**
   * Enable or disable retrieval of one record under a version check.
   * @param request - identity, expected revision, and target status.
   * @returns the stored record at its new revision.
   */
  @Remote('setStatus')
  async setStatus(request: MemoryStatusRequest): Promise<MemoryValue> {
    this.assertOwner()
    try {
      return { record: await this.ctx.memory.setStatus(request.id, request.status, request.expectedVersion) }
    } catch (error) {
      raise(error, request.id)
    }
  }

  /**
   * Delete one record permanently.
   * @param request - record identity.
   * @returns whether a record was deleted.
   */
  @Remote('remove')
  async remove(request: MemoryRemoveRequest): Promise<MemoryRemoveValue> {
    this.assertOwner()
    try {
      return { removed: await this.ctx.memory.remove(request.id) }
    } catch (error) {
      raise(error, request.id)
    }
  }

  /** Management writes are owner-only; a remote principal may read but not change memory. */
  private assertOwner(): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('remote-access/denied', 'Only the application owner can change stored memory.', {
        action: 'memory/write',
        reason: 'owner-only',
      })
    }
  }
}

/**
 * Project one wire request onto the domain filter.
 * @param request - management list request.
 * @returns the exact filter the service applies.
 */
function filterOf(request: MemoryListRequest): MemoryFilter {
  const scope = request.filter
  return {
    ...scope === undefined || scope.kind === 'all' ? {} : scope.kind === 'global'
      ? { scope: { global: true } }
      : scope.kind === 'workspace'
        ? { scope: { workspace: scope.workspace } }
        : { scope: { mode: scope.mode } },
    ...request.type === undefined ? {} : { type: request.type },
    ...request.status === undefined ? {} : { status: request.status },
    ...request.text === undefined ? {} : { text: request.text },
  }
}

/** Scope re-exported so preset declarations and tests can name the stored shape. */
export type { MemoryScope }

export default MemoryController
