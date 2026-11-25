/** Materialize the pinned kernel or check the version information embedded by its client build. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = resolve(root, 'kernel', '0.2.3-alpha.2')
const manifest = JSON.parse(readFileSync(resolve(directory, 'source.json'), 'utf8'))
const args = process.argv.slice(2)
const verifyBuild = args[0] === '--verify-build'
if ((verifyBuild && args.length !== 2) || (!verifyBuild && (args.length > 1 || args[0]?.startsWith('--')))) {
  throw new Error('Usage: node scripts/prepare-kernel-candidate.mjs [new-directory] | --verify-build <candidate-directory>')
}
const destination = resolve((verifyBuild ? args[1] : args[0]) ?? resolve(root, '.artifacts', 'kernel-' + manifest.tree.slice(0, 12)))

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('git ' + args[0] + ' failed in ' + cwd)
  return result.stdout.trim()
}

if (verifyBuild) {
  const read = name => JSON.parse(readFileSync(resolve(destination, name), 'utf8'))
  if (git(destination, 'rev-parse', 'HEAD') !== manifest.base) throw new Error('Checkout HEAD differs from the pinned upstream commit')
  if (git(destination, 'write-tree') !== manifest.tree) throw new Error('Checkout index differs from the pinned candidate tree')
  if (git(destination, 'diff', '--name-only') || git(destination, 'ls-files', '--others', '--exclude-standard')) {
    throw new Error('Candidate directory contains unstaged or untracked source files')
  }
  const expected = {
    DSH_CLIENT_VERSION: manifest.tag.replace(/^dsh-v/u, ''),
    DSH_CLIENT_FORK_VERSION: read('apps/cli/package.json').dshuVersion,
    DSH_CLIENT_UPSTREAM_COMMIT: manifest.base,
    DSH_CLIENT_UPSTREAM_DATE: git(destination, 'show', '-s', '--format=%cI', manifest.base),
    DSH_CLIENT_CANDIDATE_TREE: manifest.tree,
  }
  const { environment } = read('.dsh-build/client-build-environment.json')
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value !== 'string' || environment?.[key] !== value) {
      throw new Error(key + ' differs from the pinned release metadata')
    }
  }
  process.stdout.write('DSHU ' + expected.DSH_CLIENT_FORK_VERSION + ' · DSH ' + expected.DSH_CLIENT_VERSION + ' · ' + manifest.tree + '\n')
  process.exit(0)
}

if (existsSync(destination)) throw new Error('Choose a new destination. Existing directory: ' + destination)
mkdirSync(destination, { recursive: true })
git(destination, 'init', '--quiet')
git(destination, 'config', 'core.longpaths', 'true')
if (process.platform === 'win32') {
  // Git for Windows can default to text placeholders even on a symlink-capable volume.
  const probe = resolve(destination, '.git', 'dshu-symlink-check')
  try {
    symlinkSync('HEAD', probe, 'file')
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) throw error
  }
  if (existsSync(probe)) {
    unlinkSync(probe)
    git(destination, 'config', 'core.symlinks', 'true')
  }
}
const cached = spawnSync('git', ['-C', root, 'cat-file', '-e', manifest.base + '^{commit}'], { stdio: 'ignore' })
git(destination, 'fetch', '--quiet', '--depth=1', '--no-tags', cached.status === 0 ? root : manifest.upstream,
  cached.status === 0 ? manifest.base : 'refs/tags/' + manifest.tag)
if (git(destination, 'rev-parse', 'FETCH_HEAD^{commit}') !== manifest.base) throw new Error('Upstream tag differs from the pinned commit')
git(destination, 'checkout', '--quiet', '--detach', manifest.base)
git(destination, 'apply', '--index', resolve(directory, 'dshu.patch'))
if (git(destination, 'write-tree') !== manifest.tree) throw new Error('Materialized tree differs from the verified candidate')
process.stdout.write(destination + '\n' + manifest.tree + '\n')
