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
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { SettingsConflictError } from '@deepseek-ai/dsh-settings'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  MemoryCreateRequest,
  MemoryDescribeValue,
  MemoryListRequest,
  MemoryListValue,
  MemoryRemoveRequest,
  MemoryRemoveValue,
  MemoryScopeOption,
  MemorySourceAvailability,
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
 * Host service behind `ctx.remote.memory` (namespace `memory`). Management
 * reads and writes are owner-only because records can span private workspaces.
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
    this.assertOwner('memory/read')
    const workspaces: MemoryScopeOption[] = (this.ctx.get('workspaceRegistry')?.list() ?? []).map(workspace => ({
      value: `workspace:${workspace.id}`,
      label: workspace.title,
    }))
    const modes = new Map<string, MemoryScopeOption>()
    const knownWorkspaces = new Set(workspaces.map(workspace => workspace.value))
    const records = this.ctx.memory.records()
    for (const record of records) {
      const workspace = record.scope.workspace
      if (workspace !== undefined && !knownWorkspaces.has(workspace)) {
        knownWorkspaces.add(workspace)
        workspaces.push({ value: workspace, label: workspace.startsWith('path:') ? workspace.slice(5) : workspace })
      }
      const mode = record.scope.mode
      if (mode !== undefined && !modes.has(mode)) modes.set(mode, { value: mode, label: mode })
    }
    const ns = this.ctx.memory.settingsNamespace()
    const descriptor = ns === undefined ? undefined : this.ctx.get('settings')?.describe().find(row => row.ns === ns)
    return { totalRecords: records.length, limits: this.ctx.memory.limits(), workspaces, modes: [...modes.values()],
      extraction: { enabled: this.ctx.memory.extractionOptions().enabled, revision: descriptor?.revision ?? null },
      extractions: this.ctx.memory.extractionStatuses() }
  }

  /**
   * Persist the automatic extraction preference under a configuration revision check.
   * @param request - Desired preference and revision the management page read.
   * @returns Updated preference and current extraction outcomes.
   */
  @Remote
  async configureExtraction(request: { enabled: boolean; expectedRevision: number }): Promise<MemoryDescribeValue> {
    this.assertOwner('memory/settings')
    const ns = this.ctx.memory.settingsNamespace()
    const settings = this.ctx.get('settings')
    if (ns === undefined || settings === undefined) throw new RemoteError('memory/unavailable', 'Memory settings are unavailable', { reason: 'settings' })
    try { await settings.update(ns, { autoExtract: request.enabled }, request.expectedRevision) }
    catch (error) {
      if (error instanceof SettingsConflictError) throw new RemoteError('memory/settings-conflict', 'Memory settings changed',
        { expected: error.expected, actual: error.actual })
      throw error
    }
    if (!request.enabled) this.ctx.memory.cancelExtractions()
    return this.describe()
  }

  /**
   * Retry extraction while its source conversation is open and idle.
   * @param sessionId - Source conversation to retry.
   * @returns Updated extraction outcomes.
   */
  @Remote
  async retryExtraction(sessionId: SessionId): Promise<MemoryDescribeValue> {
    this.assertOwner('memory/extract')
    try { await this.ctx.memory.retryExtraction(sessionId) }
    catch (error) { raise(error) }
    return this.describe()
  }

  /**
   * List stored records for the management page.
   * @param request - scope, classification, status, and text filters.
   * @returns matching records, most recently updated first.
   */
  @Remote('list')
  async list(request: MemoryListRequest): Promise<MemoryListValue> {
    this.assertOwner('memory/read')
    const records = this.ctx.memory.list(filterOf(request))
    const sourced = records.filter(record => record.source.sessionId !== undefined)
    const sources: Record<string, MemorySourceAvailability> = {}
    if (sourced.length === 0) return { records, sources }
    const query = this.ctx.get('sessionQuery')
    const persistence = this.ctx.get('sessionPersistence')
    if (query === undefined || persistence === undefined) {
      for (const record of sourced) sources[record.id] = 'unknown'
      return { records, sources }
    }
    try {
      const sessions = new Set((await query.listSessions(this.ctx.invocation?.signal)).map(record => record.header.id))
      for (const record of sourced) {
        const id = record.source.sessionId
        sources[record.id] = id !== undefined && sessions.has(id) ? 'present' : 'missing'
      }
    } catch (error) {
      if (this.ctx.invocation?.signal.aborted === true) throw error
      // A failed corpus read leaves memory available, with its source explicitly unverified.
      for (const record of sourced) sources[record.id] = 'unknown'
    }
    return { records, sources }
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
  @Remote('deleteRecord')
  async remove(request: MemoryRemoveRequest): Promise<MemoryRemoveValue> {
    this.assertOwner()
    try {
      return { removed: await this.ctx.memory.remove(request.id) }
    } catch (error) {
      raise(error, request.id)
    }
  }

  /** Management cannot expose records from another workspace to a delegated caller. */
  private assertOwner(action = 'memory/write'): void {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('remote-access/denied', 'Only the application owner can manage stored memory.', {
        action,
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
