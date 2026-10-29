/** Application-owned MCP namespace reservations shared by server plugins. @module */
import type { Context } from '@deepseek-ai/cordis'
import { scopeOf } from '@deepseek-ai/dsh-scope'

declare module '@deepseek-ai/cordis' {
  interface Context { /** Application-owned server namespace registry. */ mcpNamespaces: McpNamespaceReservations }
}

/** Reservation owner for one application root, with independent Agent scopes. */
export interface McpNamespaceReservations {
  /** @param scope - Registration scope. @param name - Validated server name. @returns Idempotent reservation release. */
  reserve(scope: object, name: string): () => void
}

/**
 * Reserve a server name in the caller's registration scope.
 * @param ctx - Server plugin owner; the shared registry belongs to its application root.
 * @param name - Validated server name, unique within this scope.
 * @returns Idempotent release registered by the server's effect owner.
 */
export function reserveServerName(ctx: Context, name: string): () => void {
  const root = ctx.root
  let registry = root.get('mcpNamespaces')
  if (registry === undefined) {
    const scopes = new WeakMap<object, Set<string>>()
    const created: McpNamespaceReservations = {
      reserve(scope, name) {
        let names = scopes.get(scope)
        if (names === undefined) { names = new Set(); scopes.set(scope, names) }
        if (names.has(name)) throw new Error(
          `mcp-client: serverName "${name}" is already in use by another mcp-client instance — pick a unique serverName in cordis.yml`)
        names.add(name)
        const reserved = names
        let released = false
        return () => {
          if (released) return
          released = true
          reserved.delete(name)
          if (reserved.size === 0 && scopes.get(scope) === reserved) scopes.delete(scope)
        }
      },
    }
    root.effect(() => root.provide('mcpNamespaces', created), 'mcp-client.namespace-registry')
    registry = created
  }
  return registry.reserve(scopeOf(ctx) ?? root, name)
}
