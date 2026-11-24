/**
 * Assemble one flat release directory from build artifacts produced on separate hosts.
 * Each artifact is copied under a uniform name, checked against its container's file signature,
 * and recorded with its SHA-256 so a published download can be verified after transfer.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { createReadStream, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import yaml from 'js-yaml'
import { z } from 'zod'
import { writeStoredZip } from './release-zip.ts'

/** Installer container a collected artifact uses. */
export type ReleaseArtifactFormat = 'deb' | 'dmg' | 'exe' | 'rpm' | 'tar.gz'

/** Operating system the artifact installs on. */
type ReleaseArtifactPlatform = 'darwin' | 'linux' | 'win32'

/** One artifact copied into the release directory. */
interface ReleaseArtifact {
  readonly target: string
  readonly platform: ReleaseArtifactPlatform
  readonly arch: 'arm64' | 'x64'
  readonly format: ReleaseArtifactFormat
  readonly name: string
  readonly source: string
  readonly bytes: number
  readonly sha256: string
}

/** Signature check that rejects a truncated or mislabelled container. */
const SIGNATURES: Record<ReleaseArtifactFormat, (path: string, bytes: number) => Promise<void>> = {
  exe: async (path) => {
    const head = await readBytes(path, 0, 2)
    if (head.toString('latin1') !== 'MZ') throw new Error('does not start with the PE signature "MZ"')
  },
  deb: async (path) => {
    const head = await readBytes(path, 0, 8)
    if (head.toString('latin1') !== '!<arch>\n') throw new Error('does not start with the ar archive signature')
  },
  rpm: async (path) => {
    const head = await readBytes(path, 0, 4)
    if (!head.equals(Buffer.from([0xed, 0xab, 0xee, 0xdb]))) throw new Error('does not start with the RPM lead magic')
  },
  dmg: async (path, bytes) => {
    // UDIF writes its trailer, whose signature is "koly", in the last 512 bytes.
    const tail = await readBytes(path, bytes - 512, 512)
    if (tail.indexOf('koly') === -1) throw new Error('has no UDIF trailer signature')
  },
  'tar.gz': async (path) => {
    const head = await readBytes(path, 0, 2)
    if (head[0] !== 0x1f || head[1] !== 0x8b) throw new Error('is not gzip compressed')
  },
}

const FORMAT_EXTENSIONS: readonly (readonly [ReleaseArtifactFormat, string])[] = [
  ['tar.gz', '.tar.gz'], ['deb', '.deb'], ['rpm', '.rpm'], ['dmg', '.dmg'], ['exe', '.exe'],
]

async function readBytes(path: string, start: number, length: number): Promise<Buffer> {
  const stream = createReadStream(path, { start, end: start + length - 1 })
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function formatOf(path: string): ReleaseArtifactFormat {
  const name = basename(path)
  const match = FORMAT_EXTENSIONS.find(([, extension]) => name.endsWith(extension))
  if (match === undefined) throw new Error(`release collect: ${name} is not a known release artifact`)
  return match[0]
}

function platformOf(target: string): ReleaseArtifactPlatform {
  if (!/^(?:win|mac|linux)-(?:x64|arm64)$/u.test(target)) throw new Error(`release collect: unsupported target ${JSON.stringify(target)}`)
  if (target.startsWith('win-')) return 'win32'
  if (target.startsWith('mac-')) return 'darwin'
  if (target.startsWith('linux-')) return 'linux'
  throw new Error(`release collect: unsupported target ${JSON.stringify(target)}`)
}

function archOf(target: string): 'arm64' | 'x64' {
  const arch = target.slice(target.lastIndexOf('-') + 1)
  if (arch !== 'arm64' && arch !== 'x64') throw new Error(`release collect: unsupported architecture in ${JSON.stringify(target)}`)
  return arch
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex').toUpperCase()
}

function releaseName(version: string, target: string, format: ReleaseArtifactFormat): string {
  const extension = FORMAT_EXTENSIONS.find(([candidate]) => candidate === format)![1]
  return `DSHU-${version}-${target}${extension}`
}

/** Layout of the plain-text README shipped beside the installers, with {{TOKEN}} placeholders. */
const README_TEMPLATE_PATH = fileURLToPath(new URL('./release-readme-template.txt', import.meta.url))

/** Order the artifact blocks appear in the README, matching how a reader picks a platform. */
const README_FORMAT_ORDER: readonly ReleaseArtifactFormat[] = ['exe', 'dmg', 'deb', 'rpm', 'tar.gz']

/** Order architectures inside one format: x64 first, then arm64. */
const README_ARCH_ORDER: readonly ('x64' | 'arm64')[] = ['x64', 'arm64']

/** Width of one artifact headline row: `   ■ label ·…· size MB`. */
const README_ROW_WIDTH = 76

/**
 * Describe one artifact as a picker row label.
 * @param artifact - Collected artifact.
 * @returns Platform and architecture text shown after the marker.
 */
function readmeLabel(artifact: ReleaseArtifact): string {
  switch (artifact.format) {
    case 'exe': return 'Windows · x64'
    case 'dmg': return 'macOS · Apple Silicon'
    case 'deb': return `Debian / Ubuntu · ${artifact.arch}`
    case 'rpm': return `Fedora / RHEL / Rocky · ${artifact.arch}`
    case 'tar.gz': return `Linux 免安装包 · ${artifact.arch}`
  }
}

/**
 * Describe how to install one artifact.
 * @param artifact - Collected artifact.
 * @returns Command or action line shown under the file name.
 */
function readmeCommand(artifact: ReleaseArtifact): string {
  switch (artifact.format) {
    case 'exe': return '双击运行，按提示完成安装'
    case 'dmg': return '双击挂载，把应用拖进「应用程序」文件夹'
    case 'deb': return `$ sudo apt install ./${artifact.name}`
    case 'rpm': return `$ sudo dnf install ./${artifact.name}`
    case 'tar.gz': return `$ tar -xzf ${artifact.name}`
  }
}

/**
 * Render the artifact blocks of README section 01.
 * @param artifacts - Collected artifacts.
 * @returns Blocks separated by blank lines, in the picker order.
 */
function readmeArtifacts(artifacts: readonly ReleaseArtifact[]): string {
  const ordered = [...artifacts].sort((left, right) => {
    const byFormat = README_FORMAT_ORDER.indexOf(left.format) - README_FORMAT_ORDER.indexOf(right.format)
    return byFormat !== 0 ? byFormat : README_ARCH_ORDER.indexOf(left.arch) - README_ARCH_ORDER.indexOf(right.arch)
  })
  return ordered.map((artifact) => {
    const label = readmeLabel(artifact)
    const size = `${(artifact.bytes / 1024 / 1024).toFixed(1)} MB`
    const dots = '·'.repeat(Math.max(2, README_ROW_WIDTH - `   ■ ${label} `.length - size.length - 1))
    return `   ■ ${label} ${dots} ${size}\n     ${artifact.name}\n     ${readmeCommand(artifact)}`
  }).join('\n\n')
}

/**
 * Format the release date named by a calendar version.
 * @param version - Public version, `YYYY.MM.DD.N`.
 * @returns `YYYY-MM-DD`, or the version itself when it is not a calendar version.
 */
function readmeDate(version: string): string {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\./u.exec(version)
  return match === null ? version : `${match[1]}-${match[2]}-${match[3]}`
}

/**
 * Render the plain-text README shipped beside the installers.
 * The release directory carries no Markdown renderer, so the file stays readable in any text editor.
 * @param artifacts - Collected artifacts.
 * @param version - Public release version.
 * @param commit - Source commit the artifacts were built from, when known.
 * @returns README.newline-terminated plain text.
 */
function releaseReadme(artifacts: readonly ReleaseArtifact[], version: string, commit: string | undefined): string {
  return readFileSync(README_TEMPLATE_PATH, 'utf8')
    .replaceAll('{{ARTIFACTS}}', readmeArtifacts(artifacts))
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{COMMIT}}', commit ?? 'unknown')
    .replaceAll('{{DATE}}', readmeDate(version))
}
/** Request to assemble one release directory. */
export interface CollectReleaseOptions {
  readonly version: string
  readonly out: string
  readonly artifacts: readonly { readonly target: string; readonly path: string }[]
  readonly commit?: string
  readonly dirty?: boolean
  readonly sourceNote?: string
  readonly force?: boolean
  /** Also write `DSHU-<version>-Release.zip` beside the release directory. */
  readonly zip?: boolean
  /**
   * Channel metadata (`latest*.yml`) that installed applications read.
   * Each file is published as its own release asset; it never goes inside a platform archive.
   */
  readonly feeds?: readonly string[]
  /** Extra assets an update feed names but that are not installers, as `published-name=source`. */
  readonly auxiliary?: readonly { readonly name: string; readonly path: string }[]
}

/**
 * Archive one assembled release directory as one download per system and package format.
 * Each archive carries the documentation plus only the installers for its own platform, architecture and format.
 * @param out - Release directory holding the installers and documentation.
 * @param version - Public release version, used in the archive names.
 * @returns One archive per target and format, in the order they first appear.
 */
async function writeReleaseArchives(out: string, version: string): Promise<readonly { path: string; bytes: number; sha256: string }[]> {
  const manifest = JSON.parse(await readFile(join(out, 'RELEASE-MANIFEST.json'), 'utf8')) as {
    artifacts?: readonly { readonly name?: unknown; readonly target?: unknown; readonly format?: unknown }[]
  }
  const artifacts = (manifest.artifacts ?? [])
    .filter((artifact): artifact is { name: string; target: string; format: ReleaseArtifactFormat } =>
      typeof artifact.name === 'string' && typeof artifact.target === 'string' && typeof artifact.format === 'string')
  if (artifacts.length === 0) throw new Error('release collect: the manifest lists no artifacts to archive')
  const groups = new Map<string, { target: string; format: ReleaseArtifactFormat; members: string[] }>()
  for (const artifact of artifacts) {
    const key = `${artifact.target}-${artifact.format}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { target: artifact.target, format: artifact.format, members: [artifact.name] })
    else group.members.push(artifact.name)
  }
  const archives: { path: string; bytes: number; sha256: string }[] = []
  for (const [key, group] of groups) {
    const members = ['README.txt', ...group.members, 'LICENSE', 'SHA256SUMS.txt']
    const archive = join(dirname(out), `DSHU-${version}-${key}.zip`)
    archives.push({ path: archive, ...await writeStoredZip(members.map(name => ({ source: join(out, name), name })), archive) })
  }
  return archives
}

/**
 * Copy verified artifacts into one release directory and record their hashes.
 * @param options - Release version, destination, and the artifact each target produced.
 * @returns The collected artifacts in the order they were requested.
 */
export async function collectRelease(options: CollectReleaseOptions): Promise<readonly ReleaseArtifact[]> {
  const version = options.version.trim()
  if (version === '' || /[\\/:*?"<>|]/u.test(version)) {
    throw new Error('release collect: --version requires the public version, for example 2026.11.23.2')
  }
  const out = resolve(options.out)
  if (options.artifacts.length === 0) throw new Error('release collect: --artifact <target>=<path> is required at least once')

  const artifacts: ReleaseArtifact[] = []
  for (const entry of options.artifacts) {
    const source = resolve(entry.path)
    const format = formatOf(source)
    const platform = platformOf(entry.target)
    const file = await stat(source)
    if (!file.isFile() || file.size === 0) throw new Error(`release collect: ${source} is not a nonempty file`)
    await SIGNATURES[format](source, file.size).catch((error: unknown) => {
      throw new Error(`release collect: ${basename(source)} ${error instanceof Error ? error.message : String(error)}`)
    })
    artifacts.push({
      target: entry.target, platform, arch: archOf(entry.target), format,
      name: releaseName(version, entry.target, format), source, bytes: file.size, sha256: await sha256File(source),
    })
  }
  const duplicated = artifacts.filter((artifact, index) => artifacts.findIndex(other => other.name === artifact.name) !== index)
  if (duplicated.length > 0) throw new Error(`release collect: more than one artifact for ${duplicated.map(it => it.name).join(', ')}`)

  const extras = (options.auxiliary ?? []).map(entry => entry.name)
  const publicNames = [...artifacts.map(artifact => artifact.name), ...extras, ...(options.feeds ?? []).map(path => basename(path))]
  if (extras.some(name => !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/u.test(name)) ||
      new Set(publicNames.map(name => name.toLowerCase())).size !== publicNames.length) {
    throw new Error('release collect: expected distinct installer, update ZIP and index filenames')
  }
  await mkdir(out, { recursive: true })
  const existing = new Set(await readdir(out))
  for (const artifact of artifacts) {
    if (!options.force && existing.has(artifact.name)) {
      throw new Error(`release collect: ${artifact.name} already exists in ${out}; pass --force to replace it`)
    }
  }
  for (const artifact of artifacts) await copyFile(artifact.source, join(out, artifact.name))
  const license = resolve(import.meta.dirname, '..', '..', '..', 'LICENSE')
  await copyFile(license, join(out, 'LICENSE'))

  const written: ReleaseArtifact[] = []
  for (const artifact of artifacts) {
    const destination = join(out, artifact.name)
    const { size } = await stat(destination)
    const sha256 = await sha256File(destination)
    if (size !== artifact.bytes || sha256 !== artifact.sha256) {
      throw new Error(`release collect: ${artifact.name} changed while it was copied`)
    }
    written.push(artifact)
  }
  const licenseHash = await sha256File(join(out, 'LICENSE'))

  const publishedNames = new Map(artifacts.map(artifact => [basename(artifact.source), artifact.name]))
  const feeds: { name: string; bytes: number; sha256: string }[] = []
  const auxiliary: { name: string; bytes: number; sha256: string }[] = []
  for (const entry of options.auxiliary ?? []) {
    const source = resolve(entry.path)
    const { size } = await stat(source)
    if (size === 0) throw new Error(`release collect: ${source} is empty`)
    if (publishedNames.has(basename(source))) throw new Error(`release collect: ambiguous source name ${basename(source)}`)
    publishedNames.set(basename(source), entry.name)
    await copyFile(source, join(out, entry.name))
    auxiliary.push({ name: entry.name, bytes: size, sha256: await sha256File(join(out, entry.name)) })
  }
  for (const feed of options.feeds ?? []) {
    const name = basename(feed)
    if (!/^latest(?:-[a-z0-9]+)*\.yml$/u.test(name)) {
      throw new Error(`release collect: ${name} is not a latest*.yml channel file`)
    }
    if (feeds.some(entry => entry.name === name)) {
      throw new Error(`release collect: two sources provide ${name}; one channel file cannot describe both`)
    }
    const source = resolve(feed)
    const { size } = await stat(source)
    if (size === 0) throw new Error(`release collect: ${source} is empty`)
    const feedData = z.looseObject({ path: z.string(), files: z.array(z.looseObject({ url: z.string() })) })
      .parse(yaml.load(await readFile(source, 'utf8')))
    feedData.path = publishedNames.get(feedData.path) ?? feedData.path
    for (const file of feedData.files) file.url = publishedNames.get(file.url) ?? file.url
    await writeFile(join(out, name), yaml.dump(feedData, { lineWidth: -1 }))
    feeds.push({ name, bytes: (await stat(join(out, name))).size, sha256: await sha256File(join(out, name)) })
  }

  await writeFile(join(out, 'SHA256SUMS.txt'),
    `${[...written.map(artifact => `${artifact.sha256.toLowerCase()}  ${artifact.name}`),
      ...feeds.map(feed => `${feed.sha256.toLowerCase()}  ${feed.name}`),
      ...auxiliary.map(entry => `${entry.sha256.toLowerCase()}  ${entry.name}`),
      `${licenseHash.toLowerCase()}  LICENSE`].join('\n')}\n`)

  const manifest = {
    schemaVersion: 1,
    kind: 'release-manifest',
    version,
    generatedAt: new Date().toISOString(),
    ...(options.commit === undefined ? {} : { sourceCommit: options.commit }),
    ...(options.commit === undefined ? {} : { sourceDirty: options.dirty ?? false }),
    ...(options.sourceNote === undefined ? {} : { sourceNote: options.sourceNote }),
    artifacts: written.map(artifact => ({
      target: artifact.target, platform: artifact.platform, arch: artifact.arch,
      format: artifact.format, name: artifact.name, bytes: artifact.bytes, sha256: artifact.sha256,
      source: artifact.source,
    })),
    ...(feeds.length === 0 ? {} : { feeds }),
    ...(auxiliary.length === 0 ? {} : { auxiliary }),
  }
  await writeFile(join(out, 'RELEASE-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(join(out, 'README.txt'), releaseReadme(written, version, options.commit))
  process.stdout.write(`release collect: ${written.length} artifacts in ${out}\n`)
  for (const artifact of written) process.stdout.write(`  ${artifact.name}  ${artifact.bytes} bytes  ${artifact.sha256}\n`)
  for (const feed of feeds) process.stdout.write(`  ${feed.name}  ${feed.bytes} bytes  ${feed.sha256}\n`)
  for (const entry of auxiliary) process.stdout.write(`  ${entry.name}  ${entry.bytes} bytes  ${entry.sha256}\n`)
  if (options.zip === true) {
    for (const archive of await writeReleaseArchives(out, version)) {
      process.stdout.write(`  ${basename(archive.path)}  ${archive.bytes} bytes  ${archive.sha256}\n`)
    }
  }
  return written
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      version: { type: 'string' },
      out: { type: 'string' },
      artifact: { type: 'string', multiple: true, default: [] },
      commit: { type: 'string' },
      dirty: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'readme-only': { type: 'boolean', default: false },
      zip: { type: 'boolean', default: false },
      'source-note': { type: 'string' },
      feed: { type: 'string', multiple: true, default: [] },
      auxiliary: { type: 'string', multiple: true, default: [] },
    },
  })
  if (values.out === undefined) throw new Error('release collect: --out requires the release directory')
  if (values['readme-only']) {
    const version = await rerenderReadme(values.out, values.version, values.commit)
    if (values.zip) {
      for (const archive of await writeReleaseArchives(resolve(values.out), version)) {
        process.stdout.write(`  ${basename(archive.path)}  ${archive.bytes} bytes  ${archive.sha256}\n`)
      }
    }
    return
  }
  await collectRelease({
    version: values.version ?? '',
    out: values.out,
    artifacts: values.artifact.map((entry) => {
      const separator = entry.indexOf('=')
      if (separator <= 0) throw new Error(`release collect: ${JSON.stringify(entry)} is not <target>=<path>`)
      return { target: entry.slice(0, separator), path: entry.slice(separator + 1) }
    }),
    ...(values.commit === undefined ? {} : { commit: values.commit }),
    dirty: values.dirty,
    ...(values['source-note'] === undefined ? {} : { sourceNote: values['source-note'] }),
    feeds: values.feed,
    auxiliary: values.auxiliary.map((entry) => {
      const separator = entry.indexOf('=')
      if (separator <= 0) throw new Error(`release collect: ${JSON.stringify(entry)} is not <published-name>=<path>`)
      return { name: entry.slice(0, separator), path: entry.slice(separator + 1) }
    }),
    force: values.force,
    zip: values.zip,
  })
}

/**
 * Rewrite only README.txt from an existing release manifest, leaving the artifacts untouched.
 * @param out - Release directory holding RELEASE-MANIFEST.json.
 * @param version - Version override; the manifest's version is used when omitted.
 * @param commit - Source commit override; the manifest's commit is used when omitted.
 * @returns The version the rewritten README names.
 */
async function rerenderReadme(out: string, version: string | undefined, commit: string | undefined): Promise<string> {
  const directory = resolve(out)
  const manifest = JSON.parse(await readFile(join(directory, 'RELEASE-MANIFEST.json'), 'utf8')) as {
    version?: unknown
    sourceCommit?: unknown
    artifacts?: readonly ReleaseArtifact[]
  }
  const resolvedVersion = version?.trim() || (typeof manifest.version === 'string' ? manifest.version : '')
  if (resolvedVersion === '') throw new Error('release collect: the manifest declares no version; pass --version')
  if (manifest.artifacts === undefined || manifest.artifacts.length === 0) {
    throw new Error('release collect: the manifest lists no artifacts')
  }
  const resolvedCommit = commit ?? (typeof manifest.sourceCommit === 'string' ? manifest.sourceCommit : undefined)
  await writeFile(join(directory, 'README.txt'), releaseReadme(manifest.artifacts, resolvedVersion, resolvedCommit))
  process.stdout.write(`release collect: rewrote README.txt in ${directory}\n`)
  return resolvedVersion
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
