/** Inventory the notice files actually distributed with script interpreters and Python libraries. */
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, posix, relative, sep } from 'node:path'
import { workspaceDependencyPaths, type PrimaryRuntimeManifest } from '@deepseek-ai/dsh-tool-workspace-dependencies'

interface NoticeFile { path: string; sha256: string }
interface ComponentNotices {
  name: string
  version: string
  path: string
  notices: NoticeFile[]
  reviewRequired: boolean
}
interface DistributionNotices extends ComponentNotices {
  metadata: NoticeFile
  declaredLicense: string | null
  missingLicenseFiles: string[]
}

/** File inventory, not a certification of license compatibility or transitive notice completeness. */
export interface PrimaryRuntimeNotices {
  schemaVersion: 1
  scope: 'primary-script-runtime'
  platform: PrimaryRuntimeManifest['platform']
  arch: PrimaryRuntimeManifest['arch']
  components: ComponentNotices[]
  pythonPackages: DistributionNotices[]
}

const namedNotice = /^(?:licen[cs]e|copying|copyright|notice|authors)(?:[._-].*)?$/iu
const normalizeName = (name: string): string => name.toLowerCase().replace(/[-_.]+/gu, '-')
const portable = (path: string): string => path.split(sep).join('/')
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

function metadataHeaders(text: string, path: string): Map<string, string[]> {
  const fields = new Map<string, { value: string }[]>()
  let previous: { value: string } | undefined
  for (const line of text.split(/\r?\n/u)) {
    if (line === '') break
    if (/^[ \t]/u.test(line) && previous !== undefined) {
      previous.value += `\n${line.trim()}`
      continue
    }
    const match = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/u.exec(line)
    const [, key, value] = match ?? []
    if (key === undefined || value === undefined) throw new Error(`runtime notices: invalid metadata header in ${path}`)
    const name = key.toLowerCase()
    const values = fields.get(name) ?? []
    previous = { value }
    values.push(previous)
    fields.set(name, values)
  }
  return new Map([...fields].map(([key, values]) => [key, values.map(({ value }) => value)]))
}

function field(headers: Map<string, string[]>, key: string, path: string): string | null {
  const values = headers.get(key) ?? []
  if (values.length > 1) throw new Error(`runtime notices: invalid ${key} in ${path}`)
  return values[0] ?? null
}

function requiredField(headers: Map<string, string[]>, key: string, path: string): string {
  const value = field(headers, key, path)
  if (value === null || value.trim() === '') throw new Error(`runtime notices: invalid ${key} in ${path}`)
  return value
}

/**
 * Read a prepared payload without executing its interpreters or changing its files.
 * @param root - Payload with the supplied manifest's interpreters and installed distributions.
 * @param manifest - Validated interpreter and library versions.
 * @returns Notice paths and byte digests, including missing declared files and unreviewed collections.
 */
export async function collectPrimaryRuntimeNotices(root: string, manifest: PrimaryRuntimeManifest): Promise<PrimaryRuntimeNotices> {
  const components: ComponentNotices[] = []
  const pythonPackages: DistributionNotices[] = []
  const entries = workspaceDependencyPaths(root, manifest)
  const packageRoot = portable(relative(root, entries.pythonPackages))
  for (const name of ['node', 'pnpm', 'python'] as const) {
    const version = manifest[name]
    if (version === undefined) continue
    const component = `dependencies/${name}`
    const files = (await readdir(join(root, component), { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile()).map(entry => portable(relative(root, join(entry.parentPath, entry.name))))
      .sort((a, b) => a.localeCompare(b, 'en'))
    const byPath = new Map<string, NoticeFile>()
    for (const path of files) {
      if (!namedNotice.test(posix.basename(path)) && !/\.dist-info\/licenses\//u.test(path)) continue
      const bytes = await readFile(join(root, path))
      if (bytes.toString('utf8').trim() !== '') byPath.set(path, { path, sha256: digest(bytes) })
    }
    const record: ComponentNotices = { name, version, path: component, notices: [...byPath.values()],
      reviewRequired: ![...byPath.keys()].some(path => posix.dirname(path) === component
        && /^(?:licen[cs]e|copying)(?:[._-].*)?$/iu.test(posix.basename(path))) }
    components.push(record)
    if (name !== 'python') continue
    for (const path of files.filter(path => path.startsWith(`${packageRoot}/`) && /\.dist-info\/METADATA$/u.test(path))) {
      const directory = posix.dirname(path)
      if (posix.dirname(directory) !== packageRoot) continue
      const bytes = await readFile(join(root, path))
      const headers = metadataHeaders(bytes.toString('utf8'), path)
      const distribution = requiredField(headers, 'name', path)
      const release = requiredField(headers, 'version', path)
      const metadataVersion = requiredField(headers, 'metadata-version', path)
      if (!/^[12]\.(?:0|[1-9]\d*)$/u.test(metadataVersion)) {
        throw new Error(`runtime notices: unsupported metadata version in ${path}`)
      }
      const modern = metadataVersion.startsWith('2.') && Number(metadataVersion.slice(2)) >= 4
      const licenseRoot = modern ? `${directory}/licenses` : directory
      const missingLicenseFiles: string[] = []
      for (const declared of headers.get('license-file') ?? []) {
        if (declared.includes('\\') || declared.includes(':') || declared.split('/').some(part => part === '' || part === '.' || part === '..')) {
          throw new Error(`runtime notices: invalid License-File in ${path}`)
        }
        const target = `${licenseRoot}/${declared}`
        if (!byPath.has(target) && files.includes(target)) {
          const content = await readFile(join(root, target))
          if (content.toString('utf8').trim() !== '') byPath.set(target, { path: target, sha256: digest(content) })
        }
        if (!byPath.has(target)) missingLicenseFiles.push(target)
      }
      const notices = [...byPath.values()].filter(file => file.path.startsWith(`${directory}/`))
        .sort((a, b) => a.path.localeCompare(b.path, 'en'))
      pythonPackages.push({ name: distribution, version: release, path: directory,
        metadata: { path, sha256: digest(bytes) },
        declaredLicense: field(headers, 'license-expression', path) ?? field(headers, 'license', path),
        notices, missingLicenseFiles, reviewRequired: notices.length === 0 || missingLicenseFiles.length > 0 })
    }
    record.notices = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'))
  }
  const versions = new Map<string, string>()
  for (const distribution of pythonPackages) {
    const name = normalizeName(distribution.name)
    if (versions.has(name)) throw new Error(`runtime notices: duplicate Python distribution ${name}`)
    versions.set(name, distribution.version)
  }
  for (const [name, version] of Object.entries(manifest.pythonPackages)) {
    if (versions.get(normalizeName(name)) !== version) throw new Error(`runtime notices: missing or mismatched Python distribution ${name}@${version}`)
  }
  return { schemaVersion: 1, scope: 'primary-script-runtime', platform: manifest.platform, arch: manifest.arch,
    components, pythonPackages: pythonPackages.sort((a, b) => a.path.localeCompare(b.path, 'en')) }
}

/**
 * Add the notice inventory to a private payload before publishing its directory.
 * @param root - Build-owned, unpublished payload directory.
 * @param manifest - Validated interpreter and library versions.
 * @returns Resolves after the complete inventory is written; collection failures leave no new report.
 */
export async function preparePrimaryRuntimeNotices(root: string, manifest: PrimaryRuntimeManifest): Promise<void> {
  const report = await collectPrimaryRuntimeNotices(root, manifest)
  await writeFile(join(root, 'third-party-runtime.json'), `${JSON.stringify(report, undefined, 2)}\n`)
}
