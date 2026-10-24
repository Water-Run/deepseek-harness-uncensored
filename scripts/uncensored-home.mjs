/**
 * Bind this build's harness home before a source launch resolves any path.
 *
 * `DSH_HOME` belongs to whichever installation exported it, usually the
 * official one. A source launch uses `DSH_UNCENSORED_HOME`, or
 * `~/.dsh-uncensored` when that is unset or blank, and exports the result as
 * `DSH_HOME` so the process and every child it starts resolve one home. The
 * packaged Desktop shell and installed launchers apply the same rule.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

function expandHome(path) {
  if (path === '~') return homedir()
  return path.startsWith('~/') || path.startsWith('~\\') ? join(homedir(), path.slice(2)) : path
}

const configured = process.env.DSH_UNCENSORED_HOME
const home = configured === undefined || configured.trim() === ''
  ? join(homedir(), '.dsh-uncensored')
  : resolve(expandHome(configured))
process.env.DSH_UNCENSORED_HOME = home
process.env.DSH_HOME = home
