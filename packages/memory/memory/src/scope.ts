/**
 * Conversation scope resolution: the workspace keys and agent preset a
 * session's memory may read and write. Scope comes from recorded session
 * facts — the creation `cwd` and the preset declared by the mounted
 * composition — never from the Host process directory, so a conversation
 * without a project cannot bind itself to wherever the Host happened to
 * start.
 * @module @deepseek-ai/dsh-memory/src/scope
 */

import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionMemoryScope } from './types.ts'

/** Prefix of a scope key derived from a registered Workspace identity. */
export const WORKSPACE_KEY_PREFIX = 'workspace:'
/** Prefix of a scope key derived from a canonical project directory. */
export const PATH_KEY_PREFIX = 'path:'

/**
 * Canonicalize a recorded project directory without requiring it to exist.
 * @param directory - the session's recorded absolute directory.
 * @returns the real path when resolvable, otherwise the resolved spelling.
 */
export async function canonicalDirectory(directory: string): Promise<string> {
  try {
    return await realpath(directory)
  } catch {
    return resolve(directory)
  }
}

/**
 * The memory scope one conversation reads and writes.
 * @param ctx - context that may carry the Workspace registry.
 * @param session - the conversation.
 * @param mode - the agent preset running this composition; when omitted the
 * session's creation header supplies it.
 * @returns workspace keys (registered identity plus canonical path), the key a
 * new record should carry, the mode, and whether this is a fresh child
 * conversation that must not inherit main-line retrieval.
 */
export async function resolveSessionScope(
  ctx: Context,
  session: Session,
  mode?: string,
): Promise<SessionMemoryScope> {
  const cwd = session.header.cwd
  const registry = ctx.get('workspaceRegistry')
  let workspaceKey: string | undefined
  const keys: string[] = []
  if (cwd !== undefined) {
    const canonical = await canonicalDirectory(cwd)
    const workspace = registry === undefined ? undefined : await registry.resolveByPath(canonical).catch(() => undefined)
    if (workspace !== undefined) {
      workspaceKey = `${WORKSPACE_KEY_PREFIX}${workspace.id}`
      keys.push(workspaceKey)
    }
    const pathKey = `${PATH_KEY_PREFIX}${canonical}`
    keys.push(pathKey)
    workspaceKey ??= pathKey
  }
  const resolvedMode = mode ?? session.header.agentPreset
  return {
    workspaceKeys: keys,
    ...workspaceKey === undefined ? {} : { workspaceKey },
    ...resolvedMode === undefined ? {} : { mode: resolvedMode },
    sessionId: session.id,
    freshChild: session.header.parentSession !== undefined && !session.header.isSeeded,
  }
}
