/** Materialize the pinned DSHU kernel from main in a new, detached source directory. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = resolve(root, 'kernel', '0.2.3-alpha.2')
const manifest = JSON.parse(readFileSync(resolve(directory, 'source.json'), 'utf8'))
const destination = resolve(process.argv[2] ?? resolve(root, '.artifacts', 'kernel-' + manifest.tree.slice(0, 12)))

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('git ' + args[0] + ' failed in ' + cwd)
  return result.stdout.trim()
}

if (existsSync(destination)) throw new Error('Choose a new destination. Existing directory: ' + destination)
mkdirSync(destination, { recursive: true })
git(destination, 'init', '--quiet')
git(destination, 'config', 'core.longpaths', 'true')
const cached = spawnSync('git', ['-C', root, 'cat-file', '-e', manifest.base + '^{commit}'], { stdio: 'ignore' })
git(destination, 'fetch', '--quiet', '--depth=1', '--no-tags', cached.status === 0 ? root : manifest.upstream,
  cached.status === 0 ? manifest.base : 'refs/tags/' + manifest.tag)
if (git(destination, 'rev-parse', 'FETCH_HEAD^{commit}') !== manifest.base) throw new Error('Upstream tag differs from the pinned commit')
git(destination, 'checkout', '--quiet', '--detach', manifest.base)
git(destination, 'apply', '--index', resolve(directory, 'dshu.patch'))
if (git(destination, 'write-tree') !== manifest.tree) throw new Error('Materialized tree differs from the verified candidate')
process.stdout.write(destination + '\n' + manifest.tree + '\n')
