/** Inventory notice texts in the materialized npm tree, including version-pinned supplements. */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import supplements from '../../../LICENSES/npm/sources.json' with { type: 'json' }

interface NoticeFile {
  path: string
  sha256: string
}

interface PackageNotice {
  name: string
  version: string
  path: string
  declaredLicense: string | null
  notices: NoticeFile[]
  /** Missing texts, incomplete reviewed collections or upstream gaps; candidate presence is not license approval. */
  reviewRequired: boolean
}

const REA_AGGREGATE = 'node_modules/rea-agents/licenses/npm-runtime-notices.txt'
// Brotli's component supplements leave its wrapper and compiled encoder notices unverified.
const UPSTREAM_GAPS = new Set(['brotli@1.3.3', 'clean-git-ref@2.0.1', 'minimisted@2.0.1', 'frida@17.23.2'])
const SUPPLEMENTS_ROOT = join(import.meta.dirname, '../../../LICENSES/npm')
// This engine release ships its package, upstream and third-party notices beside the native payload.
const NESTED_NOTICE_FILES: Readonly<Record<string, readonly string[]>> = {
  '@deepseek-ai/libreoffice-kit-win32-x64@0.1.5': [
    'licenses/DeepSeek-Harness-MIT.txt',
    'licenses/LibreOffice-MPL-2.0.txt',
    'licenses/LibreOffice-third-party.html',
    'program/NOTICE',
    'program/license.txt',
  ],
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function optionalFile(path: string): Promise<Buffer | undefined> {
  try { return await readFile(path) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

/**
 * Write an exact-package notice inventory before the runtime file inventory is sealed.
 * Missing texts and incomplete reviewed collections remain review-required; this report does not certify license compatibility.
 * I/O or supplement-integrity failure aborts preparation; the caller discards the partially written runtime.
 * @param root Materialized runtime with real files rather than dependency links.
 * @param sourceDirectory Directory holding the version-pinned supplemental texts.
 * @returns Package inventory, including unresolved upstream notice gaps.
 */
export async function prepareRuntimeNotices(root: string, sourceDirectory = SUPPLEMENTS_ROOT): Promise<readonly PackageNotice[]> {
  const reaBytes = await optionalFile(join(root, REA_AGGREGATE))
  const reaText = reaBytes?.toString('utf8') ?? ''
  const packages: PackageNotice[] = []
  const entries = await readdir(join(root, 'node_modules'), { recursive: true, withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || entry.name !== 'package.json') continue
    const directory = entry.parentPath
    const path = relative(root, directory).split(sep).join('/')
    if (!/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+$/u.test(path)) continue
    const manifest: unknown = JSON.parse(await readFile(join(directory, entry.name), 'utf8'))
    if (typeof manifest !== 'object' || manifest === null || !('name' in manifest) || typeof manifest.name !== 'string'
      || !('version' in manifest) || typeof manifest.version !== 'string') {
      throw new Error(`desktop notices: invalid package identity at ${path}`)
    }
    const identity = `${manifest.name}@${manifest.version}`
    const notices: NoticeFile[] = []
    let missingExpectedText = false
    for (const file of await readdir(directory, { withFileTypes: true })) {
      if (!file.isFile()) continue
      const namedNotice = /^(?:licen[cs]e|copying|copyright|notice)(?:[._-].*)?$/iu.test(file.name)
      const readme = /^readme(?:\.md|\.txt)?$/iu.test(file.name)
      if (!namedNotice && !readme) continue
      const bytes = await readFile(join(directory, file.name))
      if (bytes.toString('utf8').trim().length > 0 && (namedNotice || /Permission is hereby granted|Redistribution and use in source and binary forms/iu.test(bytes.toString('utf8')))) {
        notices.push({ path: `${path}/${file.name}`, sha256: sha256(bytes) })
      }
    }
    for (const file of NESTED_NOTICE_FILES[identity] ?? []) {
      const bytes = await optionalFile(join(directory, ...file.split('/')))
      if (bytes === undefined || bytes.toString('utf8').trim().length === 0) missingExpectedText = true
      else notices.push({ path: `${path}/${file}`, sha256: sha256(bytes) })
    }
    if (reaBytes && reaText.includes(`===== ${identity} =====`)) {
      notices.push({ path: REA_AGGREGATE, sha256: sha256(reaBytes) })
    }
    for (const supplement of supplements.filter(item => item.packages.includes(identity))) {
      const sourcePath = join(sourceDirectory, supplement.file)
      const bytes = await readFile(sourcePath)
      if (sha256(bytes) !== supplement.sha256) throw new Error(`desktop notices: changed supplement ${supplement.file}`)
      const target = `licenses/${supplement.file}`
      await mkdir(join(root, 'licenses'), { recursive: true })
      await copyFile(sourcePath, join(root, target))
      notices.push({ path: target, sha256: supplement.sha256 })
    }
    packages.push({ name: manifest.name, version: manifest.version, path,
      declaredLicense: 'license' in manifest && typeof manifest.license === 'string' ? manifest.license : null,
      notices: notices.sort((a, b) => a.path.localeCompare(b.path, 'en')),
      reviewRequired: notices.length === 0 || missingExpectedText || UPSTREAM_GAPS.has(identity) })
  }
  if (packages.length === 0) throw new Error('desktop notices: no npm packages found')
  packages.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  await writeFile(join(root, 'third-party-runtime.json'), `${JSON.stringify({
    schemaVersion: 1, scope: 'materialized-dsh-npm-tree', packages,
    supplements: supplements.filter(item => item.packages.some(identity => packages.some(pkg => `${pkg.name}@${pkg.version}` === identity))),
  }, undefined, 2)}\n`)
  return packages
}
