import { readFileSync, writeFileSync } from 'node:fs'

const indexPath = 'packages/experimental/client-ui-forge/src/index.ts'
let index = readFileSync(indexPath, 'utf8')
index = index.replace(
  "    return await this.home.get('worktrees')?.cleanupOf(session, revision) ?? null",
  "    return await this.home.get('worktrees')?.cleanupOf(session.id, revision) ?? null",
)
index = index.replace(
  "    case 'unsupported':\n    case 'unavailable': return new RemoteError('forgePanel/diff-failed', failure.message, {})",
  "    case 'unsupported':\n    case 'rate-limited':\n    case 'unavailable': return new RemoteError('forgePanel/diff-failed', failure.message, {})",
)
index = index.replace(
  "    case 'too-large':\n    case 'unavailable': return new RemoteError('forgePanel/review-failed', failure.message, {})",
  "    case 'too-large':\n    case 'rate-limited':\n    case 'unavailable': return new RemoteError('forgePanel/review-failed', failure.message, {})",
)
writeFileSync(indexPath, index)

const panelPath = 'packages/experimental/client-ui-forge/src/panel.ts'
let panel = readFileSync(panelPath, 'utf8')
panel = panel.replace(
  "        readiness = { state: 'unavailable', message: error instanceof Error ? error.message : String(error) }",
  "        readiness = { state: 'unavailable', message: error instanceof Error ? error.message : String(error), signIn: null }",
)
writeFileSync(panelPath, panel)

const worktreePath = 'packages/experimental/client-ui-forge/src/worktree.ts'
let worktree = readFileSync(worktreePath, 'utf8')
worktree = worktree.replace(
  "    ? { branch: error.branch, from, phase: error.phase, message: error.reason }",
  "    ? { branch: error.branch, from, phase: error.phase === 'fetch' ? 'prepare' : error.phase, message: error.reason }",
)
worktree = worktree.replace(
  '          status = { ...status, phase }',
  "          status = { ...status, phase: phase === 'fetch' ? 'prepare' : phase }",
)
writeFileSync(worktreePath, worktree)
console.log('forge host surfaces adapted')
