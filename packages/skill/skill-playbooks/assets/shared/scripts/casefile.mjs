#!/usr/bin/env node
/**
 * Engagement ledger for the security and reverse-engineering playbooks.
 *
 * Plain Node, zero dependencies. One case directory per engagement keeps the
 * targets, evidence and findings that must survive context compaction and new
 * conversations. Writes are atomic and serialized through a lock file.
 *
 * Usage:
 *   node casefile.mjs init --slug web-acme --objective "..." [--kind security|reverse]
 *   node casefile.mjs target add --slug web-acme --value 10.0.0.5 --label web01 [--note "..."]
 *   node casefile.mjs evidence add --slug web-acme --kind http --ref "GET /api" [--note "..."]
 *   node casefile.mjs finding add --slug web-acme --title "..." --severity high [--target web01] [--evidence E-0001] [--cvss 8.1] [--note "..."]
 *   node casefile.mjs note add --slug web-acme --title "..." --body "..."
 *   node casefile.mjs target|evidence|finding|note list --slug web-acme
 *   node casefile.mjs status --slug web-acme
 *   node casefile.mjs report --slug web-acme [--out report.md]
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const KINDS = { security: '.security', reverse: '.reverse' }
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']
const VERSION = 1

class CliError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function fail(message, code = 1) {
  throw new CliError(message, code)
}

function parseArgs(argv) {
  const options = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      options._.push(token)
      continue
    }
    const equals = token.indexOf('=')
    if (equals !== -1) {
      options[token.slice(2, equals)] = token.slice(equals + 1)
      continue
    }
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next
      index += 1
    } else {
      options[key] = true
    }
  }
  return options
}

function requireOption(options, key) {
  const value = options[key]
  if (typeof value !== 'string' || value.length === 0) fail(`--${key} is required`, 2)
  return value
}

function caseRoot(options) {
  const kind = typeof options.kind === 'string' ? options.kind : 'security'
  if (KINDS[kind] === undefined) fail(`unknown kind "${kind}"; expected security or reverse`, 2)
  const base = resolve(typeof options.root === 'string' ? options.root : process.cwd())
  return { kind, base: join(base, KINDS[kind]) }
}

function listSlugs(options) {
  const { base } = caseRoot(options)
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(base, entry.name, 'case.json')))
    .map(entry => entry.name)
    .sort()
}

function resolveSlug(options) {
  if (typeof options.slug === 'string' && options.slug.length > 0) return options.slug
  const slugs = listSlugs(options)
  if (slugs.length === 1) return slugs[0]
  if (slugs.length === 0) fail('no case exists here; run "init --slug NAME" first', 2)
  fail(`multiple cases exist (${slugs.join(', ')}); pass --slug`, 2)
}

function caseDir(options, slug) {
  return join(caseRoot(options).base, slug)
}

function readCase(options, slug) {
  const path = join(caseDir(options, slug), 'case.json')
  if (!existsSync(path)) fail(`no case at ${path}; run "init --slug ${slug}" first`, 2)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function withLock(directory, work) {
  mkdirSync(directory, { recursive: true })
  const lock = join(directory, '.case.lock')
  let acquired = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      closeSync(openSync(lock, 'wx'))
      acquired = true
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const age = Date.now() - statSync(lock).mtimeMs
      if (age > 15000) rmSync(lock, { force: true })
      else sleep(20)
    }
  }
  if (!acquired) fail('case file is locked by another process')
  try {
    return work()
  } finally {
    rmSync(lock, { force: true })
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function writeCase(options, slug, data) {
  const directory = caseDir(options, slug)
  const path = join(directory, 'case.json')
  data.updatedAt = new Date().toISOString()
  const temporary = join(directory, `.case.${process.pid}.tmp`)
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(temporary, path)
}

function nextId(list, prefix) {
  return `${prefix}-${String(list.length + 1).padStart(4, '0')}`
}

function requireSeverity(options) {
  const severity = requireOption(options, 'severity').toLowerCase()
  if (!SEVERITIES.includes(severity)) fail(`--severity must be one of ${SEVERITIES.join(', ')}`, 2)
  return severity
}

function addTarget(data, options) {
  const target = {
    id: nextId(data.targets, 'T'),
    value: requireOption(options, 'value'),
    label: typeof options.label === 'string' ? options.label : '',
    note: typeof options.note === 'string' ? options.note : '',
    addedAt: new Date().toISOString(),
  }
  data.targets.push(target)
  return target
}

function addEvidence(data, options) {
  const entry = {
    id: nextId(data.evidence, 'E'),
    kind: typeof options.type === 'string' ? options.type : 'note',
    ref: requireOption(options, 'ref'),
    note: typeof options.note === 'string' ? options.note : '',
    addedAt: new Date().toISOString(),
  }
  data.evidence.push(entry)
  return entry
}

function addFinding(data, options) {
  const evidence = typeof options.evidence === 'string'
    ? options.evidence.split(',').map(item => item.trim()).filter(Boolean)
    : []
  for (const id of evidence) {
    if (!data.evidence.some(entry => entry.id === id)) fail(`unknown evidence id ${id}`, 2)
  }
  const finding = {
    id: nextId(data.findings, 'F'),
    title: requireOption(options, 'title'),
    severity: requireSeverity(options),
    target: typeof options.target === 'string' ? options.target : '',
    cvss: typeof options.cvss === 'string' ? options.cvss : '',
    evidence,
    note: typeof options.note === 'string' ? options.note : '',
    status: typeof options.status === 'string' ? options.status : 'open',
    addedAt: new Date().toISOString(),
  }
  data.findings.push(finding)
  return finding
}

function addNote(data, options) {
  const note = {
    id: nextId(data.notes, 'N'),
    title: requireOption(options, 'title'),
    body: typeof options.body === 'string' ? options.body : '',
    addedAt: new Date().toISOString(),
  }
  data.notes.push(note)
  return note
}

function renderList(kind, rows) {
  if (rows.length === 0) return `no ${kind} yet`
  return rows.map((row) => {
    const head = `${row.id}\t${row.value ?? row.title ?? row.ref}`
    const meta = [row.severity, row.label, row.kind, row.target].filter(Boolean).join(' · ')
    return `${head}${meta ? `\t${meta}` : ''}`
  }).join('\n')
}

function renderReport(data) {
  const lines = []
  lines.push(`# ${data.slug} — ${data.kind === 'reverse' ? 'reverse-engineering case' : 'security engagement'}`, '')
  if (data.objective) lines.push(`**Objective:** ${data.objective}`, '')
  lines.push(`**Created:** ${data.createdAt}`, `**Updated:** ${data.updatedAt}`, '')
  lines.push('## Targets', '', '| ID | Target | Label | Note |', '| --- | --- | --- | --- |')
  for (const target of data.targets) lines.push(`| ${target.id} | \`${target.value}\` | ${target.label} | ${target.note} |`)
  lines.push('', '## Findings', '', '| ID | Title | Severity | CVSS | Target | Evidence |', '| --- | --- | --- | --- | --- | --- |')
  for (const finding of data.findings) {
    lines.push(`| ${finding.id} | ${finding.title} | ${finding.severity} | ${finding.cvss} | ${finding.target} | ${finding.evidence.join(', ')} |`)
  }
  for (const finding of data.findings) {
    const bullets = [`- Severity: ${finding.severity}`]
    if (finding.cvss) bullets.push(`- CVSS: ${finding.cvss}`)
    if (finding.target) bullets.push(`- Target: ${finding.target}`)
    bullets.push(`- Evidence: ${finding.evidence.join(', ') || 'none'}`)
    lines.push('', `### ${finding.id} — ${finding.title}`, '', ...bullets, '', finding.note || '_No description recorded._')
  }
  lines.push('', '## Evidence', '', '| ID | Kind | Reference | Note |', '| --- | --- | --- | --- |')
  for (const entry of data.evidence) lines.push(`| ${entry.id} | ${entry.kind} | \`${entry.ref}\` | ${entry.note} |`)
  if (data.notes.length > 0) {
    lines.push('', '## Notes')
    for (const note of data.notes) lines.push('', `### ${note.id} — ${note.title}`, '', note.body)
  }
  return `${lines.join('\n')}\n`
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const [group, action] = options._
  if (group === undefined) fail('usage: casefile.mjs <init|target|evidence|finding|note|status|report> [options]', 2)

  if (group === 'init') {
    const { kind, base } = caseRoot(options)
    const slug = requireOption(options, 'slug')
    if (!/^[A-Za-z0-9._-]+$/u.test(slug)) fail('--slug may contain letters, digits, dot, underscore and hyphen only', 2)
    const directory = join(base, slug)
    mkdirSync(directory, { recursive: true })
    mkdirSync(join(directory, 'notes'), { recursive: true })
    mkdirSync(join(directory, 'loot'), { recursive: true })
    const now = new Date().toISOString()
    const data = {
      version: VERSION, kind, slug,
      objective: typeof options.objective === 'string' ? options.objective : '',
      createdAt: now, updatedAt: now,
      targets: [], evidence: [], findings: [], notes: [],
    }
    withLock(directory, () => writeCase(options, slug, data))
    process.stdout.write(`${join(directory, 'case.json')}\n`)
    return
  }

  const slug = resolveSlug(options)
  const directory = caseDir(options, slug)

  if (group === 'status') {
    const data = readCase(options, slug)
    if (options.json === true) {
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
      return
    }
    process.stdout.write([
      `case: ${slug} (${data.kind})`,
      `objective: ${data.objective || '-'}`,
      `targets: ${data.targets.length}  evidence: ${data.evidence.length}  findings: ${data.findings.length}  notes: ${data.notes.length}`,
      `updated: ${data.updatedAt}`,
    ].join('\n') + '\n')
    return
  }

  if (group === 'report') {
    const data = readCase(options, slug)
    const markdown = renderReport(data)
    if (typeof options.out === 'string') {
      const output = resolve(options.out)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, markdown)
      process.stdout.write(`${output}\n`)
    } else {
      process.stdout.write(markdown)
    }
    return
  }

  if (!['target', 'evidence', 'finding', 'note'].includes(group)) fail(`unknown command "${group}"`, 2)

  if (action === 'list') {
    const data = readCase(options, slug)
    const rows = data[`${group}s`]
    if (options.json === true) {
      process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
      return
    }
    process.stdout.write(`${renderList(`${group}s`, rows)}\n`)
    return
  }

  if (action !== 'add') fail(`usage: casefile.mjs ${group} <add|list> [options]`, 2)

  withLock(directory, () => {
    const data = readCase(options, slug)
    const created = group === 'target' ? addTarget(data, options)
      : group === 'evidence' ? addEvidence(data, options)
      : group === 'finding' ? addFinding(data, options)
      : addNote(data, options)
    writeCase(options, slug, data)
    process.stdout.write(`${JSON.stringify(created)}\n`)
  })
}

try {
  main()
} catch (error) {
  if (error instanceof CliError) {
    process.stderr.write(`casefile: ${error.message}\n`)
    process.exit(error.code)
  }
  process.stderr.write(`casefile: ${error.stack ?? error.message}\n`)
  process.exit(1)
}
