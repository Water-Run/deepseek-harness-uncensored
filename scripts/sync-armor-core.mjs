#!/usr/bin/env node
/**
 * Sync and verify the upstream core fragments of the armor prompt.
 *
 * `--check` (default) recomputes the digest of every generated fragment and compares it
 * with `armor-core.lock.json`. It needs no network, so a build can pin the text.
 *
 * `--ref <tag>` fetches the pinned upstream sources, asserts that the English fragments
 * still contain the upstream text, and rewrites the lock with the new refs and digests.
 *
 * Usage:
 *   node scripts/sync-armor-core.mjs --check
 *   node scripts/sync-armor-core.mjs --ref v1.7.20 [--commit <sha>] [--time <iso>]
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = join(root, 'packages', 'context', 'uncensored-armor')
const lockPath = join(packageRoot, 'armor-core.lock.json')

/** One generated fragment: its exporting module and the constant name. */
const FRAGMENTS = [
  { id: 'CORE_EN', file: 'src/core/en.ts', name: 'CORE_EN' },
  { id: 'CORE_ZH', file: 'src/core/zh.ts', name: 'CORE_ZH' },
  { id: 'BOOST_EN', file: 'src/boost/en.ts', name: 'BOOST_EN' },
  { id: 'BOOST_ZH', file: 'src/boost/zh.ts', name: 'BOOST_ZH' },
]

const args = new Map()
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]
  if (!token.startsWith('--')) continue
  const [key, inline] = token.slice(2).split('=')
  if (inline !== undefined) { args.set(key, inline); continue }
  const next = argv[index + 1]
  if (next !== undefined && !next.startsWith('--')) { args.set(key, next); index += 1 } else args.set(key, 'true')
}

/** Normalize whitespace so line wrapping in an upstream file cannot fail the check. */
function normalize(text) {
  return text.replace(/\s+/gu, ' ').trim()
}

/** Read the template literal one module exports under a constant name. */
function fragmentText(file, name) {
  const source = readFileSync(join(packageRoot, file), 'utf8')
  const at = source.indexOf(`export const ${name} = `)
  if (at < 0) throw new Error(`${file} does not export ${name}`)
  const open = source.indexOf('`', at)
  const close = source.indexOf('`', open + 1)
  if (open < 0 || close < 0) throw new Error(`${file} has no template literal for ${name}`)
  return source.slice(open + 1, close)
}

/** Digest one fragment for the lock. */
function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Fetch one upstream file at the pinned tag, or read it from a local sources directory. */
async function fetchUpstream(repository, tag, path, sources) {
  if (sources !== undefined) return readFileSync(join(resolve(sources), path.split('/').at(-1)), 'utf8')
  const url = `${repository.replace(/\.git$/u, '')}/raw/${tag}/${path}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`cannot read ${url}: HTTP ${response.status}`)
  return response.text()
}

/** Extract a backtick-delimited constant from upstream source. */
function templateConstant(source, name) {
  const at = source.indexOf(`export const ${name} = `)
  if (at < 0) throw new Error(`upstream does not export ${name}`)
  const open = source.indexOf('`', at)
  const close = source.indexOf('`', open + 1)
  if (open < 0 || close < 0) throw new Error(`upstream ${name} is not a template literal`)
  return source.slice(open + 1, close)
}

/** Assert the upstream sentence groups survive inside the English fragments. */
function assertUpstreamContained(upstream, local, label) {
  if (!normalize(local).includes(normalize(upstream))) {
    throw new Error(`${label} drifted from upstream; re-port the fragment before updating the lock`)
  }
}

async function runRef(tag) {
  const repository = 'https://github.com/kingcharleslzy-ai/dsh-purge'
  const sources = args.get('sources')
  const shared = await fetchUpstream(repository, tag, 'lib/patches/shared.mjs', sources)
  const boost = await fetchUpstream(repository, tag, 'lib/boost.js', sources)
  const { STRONG_INTRO } = await import(`data:text/javascript,${encodeURIComponent(shared)}`)
  const upstreamBoost = templateConstant(boost, 'BOOST_TEXT')
  assertUpstreamContained(STRONG_INTRO, fragmentText('src/core/en.ts', 'CORE_EN'), 'CORE_EN')
  assertUpstreamContained(upstreamBoost, fragmentText('src/boost/en.ts', 'BOOST_EN'), 'BOOST_EN')
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  lock.tag = tag
  lock.commit = args.get('commit') ?? lock.commit
  lock.commitTime = args.get('time') ?? lock.commitTime
  lock.sources = {
    'lib/patches/shared.mjs': digest(shared),
    'lib/boost.js': digest(boost),
  }
  lock.fragments = Object.fromEntries(FRAGMENTS.map(fragment => [fragment.id, digest(fragmentText(fragment.file, fragment.name))]))
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  process.stdout.write(`armor core pinned to ${tag}\n`)
}

function runCheck() {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const drifted = []
  for (const fragment of FRAGMENTS) {
    const actual = digest(fragmentText(fragment.file, fragment.name))
    if (actual !== lock.fragments?.[fragment.id]) drifted.push(`${fragment.id}: ${lock.fragments?.[fragment.id] ?? 'missing'} -> ${actual}`)
  }
  if (drifted.length > 0) {
    process.stderr.write(`armor core drift against ${lock.tag ?? 'the lock'}:\n${drifted.join('\n')}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`armor core matches ${lock.tag} (${FRAGMENTS.length} fragments)\n`)
}

if (args.has('ref')) await runRef(args.get('ref'))
else runCheck()
