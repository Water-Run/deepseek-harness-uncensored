/**
 * Writing materials: the `story/` registry, its files, and the model-visible
 * rendering of the current selection.
 *
 * `story/bible/*.md` and `story/style/*.md` are the user's own documents — the
 * writing playbooks already read and write them. This module adds a registry
 * (`story/materials.json`) that records which of them the settings surface
 * manages and which are currently selected. Removing a material removes its
 * record; the document itself is never deleted, and a file the registry does
 * not know yet is listed so it can be adopted rather than overwritten.
 */

import { Buffer } from 'node:buffer'
import type { FileSystem, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  DossierProblem,
  StoryEntryDocument,
  StoryEntryView,
  StoryListing,
  StorySection,
} from './types.ts'
import {
  DossierProblemError,
  fsErrorCode,
  isRecord,
  normalizeRelativePath,
  numberField,
  problemOf,
  resolveInside,
  resolveOptions,
  stringArrayField,
  stringField,
} from './files.ts'

/** Registry format version this build reads and writes. */
export const STORY_REGISTRY_VERSION = 1

/** Directory that holds every writing material. */
export const STORY_ROOT = 'story'

/** Registry path, workspace-relative. */
export const STORY_REGISTRY_PATH = 'story/materials.json'

/** Section directories, workspace-relative. */
export const STORY_SECTION_DIRS: Readonly<Record<StorySection, string>> = {
  style: 'story/style',
  bible: 'story/bible',
}

/** Largest single material this service renders into one request. */
export const STORY_MATERIAL_MAX_BYTES = 8192

/** One registered material. */
interface StoryRecord {
  readonly path: string
  readonly title: string
  readonly section: StorySection
  readonly createdAt: string
}

/** Parsed registry beside the object it came from. */
interface StoryRegistryFile {
  readonly raw: Record<string, unknown>
  readonly records: readonly StoryRecord[]
  readonly selected: readonly string[]
  /** Version of the file this parse came from. */
  readonly version: FsVersion
}

/** Model-visible material, ready to render. */
export interface StoryMaterial {
  readonly path: string
  readonly markdown: string
  readonly truncated: boolean
}

/** Empty registry object. */
function emptyRegistry(): Record<string, unknown> {
  return { version: STORY_REGISTRY_VERSION, entries: [], selected: [], updatedAt: '' }
}

/**
 * Section of a managed path, or undefined when it is outside both directories.
 * @param path - workspace-relative path.
 * @returns the section directory the path belongs to.
 */
export function sectionOfPath(path: string): StorySection | undefined {
  if (path.startsWith(`${STORY_SECTION_DIRS.style}/`)) return 'style'
  if (path.startsWith(`${STORY_SECTION_DIRS.bible}/`)) return 'bible'
  return undefined
}

/**
 * Validate a material path and derive its section.
 * @param path - caller-supplied workspace-relative path.
 * @returns the normalized path and its section.
 * @throws {DossierProblemError} when the path is outside the managed directories or is not Markdown.
 */
export function materialPath(path: string): { path: string; section: StorySection } {
  const normalized = normalizeRelativePath(path)
  const section = sectionOfPath(normalized)
  if (section === undefined) {
    throw new DossierProblemError('unreadable', `"${path}" is not a material under ${STORY_SECTION_DIRS.style}/ or ${STORY_SECTION_DIRS.bible}/`)
  }
  if (!normalized.toLowerCase().endsWith('.md')) {
    throw new DossierProblemError('unreadable', `"${path}" is not a Markdown document`)
  }
  return { path: normalized, section }
}

/** Validate a file stem used to create a material. */
function materialName(name: string): string {
  const trimmed = name.trim()
  if (!/^[A-Za-z0-9._-]+$/u.test(trimmed) || trimmed === '.' || trimmed === '..') {
    throw new DossierProblemError('corrupt', `"${name}" is not a file name; use letters, digits, dot, underscore and hyphen only`)
  }
  return trimmed
}

/**
 * Parse the stored registry.
 * @param text - registry file text.
 * @param version - version the file was read at.
 * @returns the parsed registry.
 * @throws {DossierProblemError} when the file is not a registry this build reads.
 */
export function parseStoryRegistry(text: string, version: FsVersion): StoryRegistryFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DossierProblemError('corrupt', `${STORY_REGISTRY_PATH} is not valid JSON`)
  }
  if (!isRecord(parsed)) throw new DossierProblemError('corrupt', `${STORY_REGISTRY_PATH} does not hold a JSON object`)
  const stored = numberField(parsed, 'version', 0)
  if (stored > STORY_REGISTRY_VERSION) {
    throw new DossierProblemError(
      'unsupported-version',
      `${STORY_REGISTRY_PATH} uses materials format version ${stored}; this build reads version ${STORY_REGISTRY_VERSION}`,
    )
  }
  if (stored !== STORY_REGISTRY_VERSION) {
    throw new DossierProblemError('corrupt', `${STORY_REGISTRY_PATH} has no supported materials format version`)
  }
  const entries = parsed.entries
  if (entries !== undefined && !Array.isArray(entries)) {
    throw new DossierProblemError('corrupt', `${STORY_REGISTRY_PATH}: "entries" is not an array`)
  }
  const records: StoryRecord[] = []
  for (const [index, entry] of (entries ?? []).entries()) {
    if (!isRecord(entry)) throw new DossierProblemError('corrupt', `${STORY_REGISTRY_PATH}: entries[${index}] is not an object`)
    const path = stringField(entry, 'path')
    const section = sectionOfPath(path)
    if (section === undefined) {
      throw new DossierProblemError('corrupt', `${STORY_REGISTRY_PATH}: entries[${index}] names "${path}", outside the managed directories`)
    }
    records.push({ path, title: stringField(entry, 'title'), section, createdAt: stringField(entry, 'createdAt') })
  }
  return { raw: parsed, records, selected: stringArrayField(parsed, 'selected'), version }
}

/** Registry text for storage, preserving keys this build does not model. */
function serializeRegistry(
  raw: Record<string, unknown>,
  records: readonly StoryRecord[],
  selected: readonly string[],
  now: string,
): string {
  raw.version = STORY_REGISTRY_VERSION
  raw.entries = records.map(record => ({ ...record }))
  raw.selected = [...selected]
  raw.updatedAt = now
  return `${JSON.stringify(raw, null, 2)}\n`
}

/**
 * Title of a Markdown document: its first heading, else its file stem.
 * @param path - workspace-relative document path.
 * @param markdown - document text.
 * @returns the first heading, or the file stem when the document has none.
 */
export function titleOfMarkdown(path: string, markdown: string): string {
  const heading = /^#{1,6}\s+(.+)$/mu.exec(markdown)
  if (heading?.[1] !== undefined) return heading[1].trim()
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/iu, '')
}

/** Read the registry, tolerating its absence. */
async function readRegistry(
  fs: FileSystem,
  rootPath: string,
  signal: AbortSignal | undefined,
): Promise<StoryRegistryFile | undefined> {
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, STORY_REGISTRY_PATH, signal)
  const info = await fs.stat(target, signal)
  if (info === undefined) return undefined
  if (info.type !== 'file') throw new DossierProblemError('unreadable', `${STORY_REGISTRY_PATH} is not a regular file`)
  return parseStoryRegistry(await fs.readText(target, signal), info.version)
}

/**
 * Store the registry under the version it was read at.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param registry - registry this write is based on, or undefined when it did not exist.
 * @param records - records to store.
 * @param selected - selection to store.
 * @param signal - caller cancellation.
 * @throws {DossierProblemError} when another writer changed the registry after it was read.
 */
async function writeRegistry(
  fs: FileSystem,
  rootPath: string,
  registry: StoryRegistryFile | undefined,
  records: readonly StoryRecord[],
  selected: readonly string[],
  signal: AbortSignal | undefined,
): Promise<void> {
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, STORY_REGISTRY_PATH, signal)
  const existing = await fs.stat(target, signal)
  if (registry !== undefined) {
    if (existing === undefined || String(existing.version) !== String(registry.version)) {
      throw new DossierProblemError('conflict', `${STORY_REGISTRY_PATH} changed since it was read; reload the list before saving`)
    }
  } else if (existing !== undefined) {
    throw new DossierProblemError('conflict', `${STORY_REGISTRY_PATH} appeared while saving; reload the list before saving`)
  }
  const raw = registry?.raw ?? emptyRegistry()
  const intent = existing === undefined ? { kind: 'createIfAbsent' as const } : { kind: 'replaceIfVersion' as const, version: existing.version }
  try {
    await fs.writeText(target, serializeRegistry(raw, records, selected, new Date().toISOString()), intent, signal)
  } catch (error: unknown) {
    if (fsErrorCode(error) === 'FS_STALE_VERSION' || fsErrorCode(error) === 'FS_NOT_OBSERVED') {
      throw new DossierProblemError('conflict', `${STORY_REGISTRY_PATH} changed while saving; reload the list before saving`)
    }
    throw problemOf(error)
  }
}

/** Resolve one workspace directory and list its Markdown children. */
async function listMarkdown(
  fs: FileSystem,
  rootPath: string,
  directory: string,
  signal: AbortSignal | undefined,
): Promise<{ path: string; name: string; bytes?: number }[]> {
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, directory, signal)
  const info = await fs.stat(target, signal)
  if (info?.type !== 'directory') return []
  const children = await fs.listDir(target, signal)
  return children
    .filter(child => child.type === 'file' && child.name.toLowerCase().endsWith('.md'))
    .map(child => ({
      path: `${directory}/${child.name}`,
      name: child.name,
      ...child.size === undefined ? {} : { bytes: child.size },
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * List every managed and unmanaged writing material.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param signal - caller cancellation.
 * @returns the listing, or a reported problem for the surface to show.
 */
export async function listStory(
  fs: FileSystem,
  rootPath: string,
  signal: AbortSignal | undefined,
): Promise<StoryListing> {
  let registry: StoryRegistryFile | undefined
  let problem: DossierProblem | undefined
  try {
    registry = await readRegistry(fs, rootPath, signal)
  } catch (error: unknown) {
    const reported = problemOf(error)
    problem = { code: reported.code, detail: reported.message }
  }
  const records = registry?.records ?? []
  const selected = registry?.selected ?? []
  const discovered: { path: string; bytes?: number }[] = []
  for (const directory of Object.values(STORY_SECTION_DIRS)) {
    try {
      discovered.push(...(await listMarkdown(fs, rootPath, directory, signal)))
    } catch (error: unknown) {
      if (fsErrorCode(error) !== 'FS_NOT_FOUND') {
        const reported = problemOf(error)
        problem ??= { code: reported.code, detail: reported.message }
      }
    }
  }
  const sizes = new Map(discovered.map(entry => [entry.path, entry.bytes]))
  const entries: StoryEntryView[] = records.map((record) => {
    const bytes = sizes.get(record.path)
    return {
      path: record.path,
      title: record.title.length > 0 ? record.title : titleOfMarkdown(record.path, ''),
      section: record.section,
      selected: selected.includes(record.path),
      registered: true,
      missing: bytes === undefined,
      ...bytes === undefined ? {} : { bytes },
    }
  })
  const registered = new Set(records.map(record => record.path))
  const unregistered: StoryEntryView[] = discovered
    .filter(entry => !registered.has(entry.path))
    .map((entry) => {
      const section = sectionOfPath(entry.path)
      /* v8 ignore next -- discovery only walks the two managed directories. */
      if (section === undefined) throw new DossierProblemError('corrupt', `${entry.path} is outside the managed directories`)
      return {
        path: entry.path,
        title: titleOfMarkdown(entry.path, ''),
        section,
        selected: selected.includes(entry.path),
        registered: false,
        missing: false,
        ...entry.bytes === undefined ? {} : { bytes: entry.bytes },
      }
    })
  return { entries, unregistered, selected, ...problem === undefined ? {} : { problem } }
}

/**
 * Read one writing material.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param path - caller-supplied material path.
 * @param signal - caller cancellation.
 * @returns content with its freshness token.
 * @throws {DossierProblemError} when the material is absent or outside the workspace.
 */
export async function readStoryEntry(
  fs: FileSystem,
  rootPath: string,
  path: string,
  signal: AbortSignal | undefined,
): Promise<StoryEntryDocument> {
  const material = materialPath(path)
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, material.path, signal)
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file') throw new DossierProblemError('workspace-missing', `no material at ${material.path}`)
  const markdown = await fs.readText(target, signal)
  return {
    path: material.path,
    title: titleOfMarkdown(material.path, markdown),
    section: material.section,
    version: String(info.version),
    markdown,
  }
}

/**
 * Replace one material's content under its version guard.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param path - caller-supplied material path.
 * @param markdown - complete new content.
 * @param expectedVersion - version the editor was opened at.
 * @param signal - caller cancellation.
 * @returns the stored content with its new version.
 * @throws {DossierProblemError} when the file moved on or is absent.
 */
export async function writeStoryEntry(
  fs: FileSystem,
  rootPath: string,
  path: string,
  markdown: string,
  expectedVersion: string,
  signal: AbortSignal | undefined,
): Promise<StoryEntryDocument> {
  const material = materialPath(path)
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, material.path, signal)
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file') throw new DossierProblemError('workspace-missing', `no material at ${material.path}`)
  if (String(info.version) !== expectedVersion) {
    throw new DossierProblemError('conflict', `${material.path} changed since it was opened; reload it before saving`)
  }
  let version: FsVersion
  try {
    version = (await fs.writeText(target, markdown, { kind: 'replaceIfVersion', version: info.version }, signal)).version
  } catch (error: unknown) {
    if (fsErrorCode(error) === 'FS_STALE_VERSION') {
      throw new DossierProblemError('conflict', `${material.path} changed since it was opened; reload it before saving`)
    }
    throw problemOf(error)
  }
  return {
    path: material.path,
    title: titleOfMarkdown(material.path, markdown),
    section: material.section,
    version: String(version),
    markdown,
  }
}

/**
 * Create one material and register it as selected.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param section - document family.
 * @param name - file stem.
 * @param title - registry title.
 * @param markdown - initial content.
 * @param signal - caller cancellation.
 * @returns the stored content with its version.
 * @throws {DossierProblemError} when the file or registry already holds that path.
 */
export async function createStoryEntry(
  fs: FileSystem,
  rootPath: string,
  section: StorySection,
  name: string,
  title: string,
  markdown: string,
  signal: AbortSignal | undefined,
): Promise<StoryEntryDocument> {
  const path = `${STORY_SECTION_DIRS[section]}/${materialName(name)}.md`
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, path, signal)
  const existing = await fs.stat(target, signal)
  if (existing !== undefined) throw new DossierProblemError('corrupt', `${path} already exists`)
  const registry = await readRegistry(fs, rootPath, signal)
  if (registry?.records.some(record => record.path === path) === true) {
    throw new DossierProblemError('corrupt', `${path} is already registered`)
  }
  let version: FsVersion
  try {
    version = (await fs.writeText(target, markdown, { kind: 'createIfAbsent' }, signal)).version
  } catch (error: unknown) {
    if (fsErrorCode(error) === 'FS_NOT_OBSERVED') throw new DossierProblemError('corrupt', `${path} already exists`)
    throw problemOf(error)
  }
  const now = new Date().toISOString()
  const resolvedTitle = title.trim().length > 0 ? title.trim() : titleOfMarkdown(path, markdown)
  const records = [...registry?.records ?? [], { path, title: resolvedTitle, section, createdAt: now }]
  const selected = [...registry?.selected ?? [], path]
  await writeRegistry(fs, rootPath, registry, records, selected, signal)
  return { path, title: resolvedTitle, section, version: String(version), markdown }
}

/**
 * Drop one material's registry record and its selection.
 *
 * The document itself stays in the workspace: the surface states that before
 * asking, and this operation never removes a user file.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param path - caller-supplied material path.
 * @param signal - caller cancellation.
 * @returns the paths still selected.
 * @throws {DossierProblemError} when the registry holds no such record.
 */
export async function removeStoryEntry(
  fs: FileSystem,
  rootPath: string,
  path: string,
  signal: AbortSignal | undefined,
): Promise<{ selected: string[] }> {
  const material = materialPath(path)
  const registry = await readRegistry(fs, rootPath, signal)
  if (registry === undefined) throw new DossierProblemError('workspace-missing', `${STORY_REGISTRY_PATH} does not exist`)
  if (!registry.records.some(record => record.path === material.path)) {
    throw new DossierProblemError('corrupt', `${material.path} is not registered`)
  }
  const records = registry.records.filter(record => record.path !== material.path)
  const selected = registry.selected.filter(entry => entry !== material.path)
  await writeRegistry(fs, rootPath, registry, records, selected, signal)
  return { selected }
}

/**
 * Adopt an existing Markdown file into the registry.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param path - caller-supplied material path.
 * @param signal - caller cancellation.
 * @returns the listing after adoption.
 * @throws {DossierProblemError} when the file is absent, unreadable, or already registered.
 */
export async function adoptStoryEntry(
  fs: FileSystem,
  rootPath: string,
  path: string,
  signal: AbortSignal | undefined,
): Promise<StoryListing> {
  const material = materialPath(path)
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, material.path, signal)
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file') throw new DossierProblemError('workspace-missing', `no material at ${material.path}`)
  const registry = await readRegistry(fs, rootPath, signal)
  if (registry?.records.some(record => record.path === material.path) === true) {
    throw new DossierProblemError('corrupt', `${material.path} is already registered`)
  }
  const now = new Date().toISOString()
  const title = titleOfMarkdown(material.path, await fs.readText(target, signal))
  const records = [...registry?.records ?? [], { path: material.path, title, section: material.section, createdAt: now }]
  await writeRegistry(fs, rootPath, registry, records, registry?.selected ?? [], signal)
  return await listStory(fs, rootPath, signal)
}

/**
 * Replace the selected material set.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param selected - workspace-relative material paths to render into writing requests.
 * @param signal - caller cancellation.
 * @returns the stored selection.
 * @throws {DossierProblemError} when a path is outside the managed directories or not registered.
 */
export async function setStorySelection(
  fs: FileSystem,
  rootPath: string,
  selected: readonly string[],
  signal: AbortSignal | undefined,
): Promise<{ selected: string[] }> {
  const registry = await readRegistry(fs, rootPath, signal)
  if (registry === undefined) throw new DossierProblemError('workspace-missing', `${STORY_REGISTRY_PATH} does not exist`)
  const registered = new Set(registry.records.map(record => record.path))
  const next: string[] = []
  for (const entry of selected) {
    const material = materialPath(entry)
    if (!registered.has(material.path)) {
      throw new DossierProblemError('corrupt', `${material.path} is not registered in ${STORY_REGISTRY_PATH}`)
    }
    if (!next.includes(material.path)) next.push(material.path)
  }
  await writeRegistry(fs, rootPath, registry, registry.records, next, signal)
  return { selected: next }
}

/**
 * Read the selected materials for one request.
 *
 * Bounded per document and in total so one long style card cannot crowd out
 * the conversation. A registered file that has gone missing is skipped rather
 * than failing the request that would have used it.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param totalBytes - inclusive byte budget across every selected material.
 * @param signal - caller cancellation.
 * @returns the materials in registry order, with truncation marked.
 */
export async function readSelectedMaterials(
  fs: FileSystem,
  rootPath: string,
  totalBytes: number,
  signal: AbortSignal | undefined,
): Promise<StoryMaterial[]> {
  const registry = await readRegistry(fs, rootPath, signal)
  if (registry === undefined) return []
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const materials: StoryMaterial[] = []
  let remaining = totalBytes
  for (const path of registry.selected) {
    if (remaining <= 0) break
    const target = await resolveInside(fs, root, rootPath, path, signal)
    const info = await fs.stat(target, signal)
    if (info?.type !== 'file') continue
    const whole = await fs.readText(target, signal)
    const budget = Math.min(STORY_MATERIAL_MAX_BYTES, remaining)
    const bytes = Buffer.byteLength(whole, 'utf8')
    const truncated = bytes > budget
    const text = truncated ? Buffer.from(whole, 'utf8').subarray(0, budget).toString('utf8') : whole
    remaining -= Math.min(bytes, budget)
    materials.push({
      path,
      markdown: truncated ? `${text}\n\n[truncated: ${bytes - budget} bytes omitted]` : text,
      truncated,
    })
  }
  return materials
}

/**
 * Render the selected materials as one model-visible block.
 * @param materials - selected documents in registry order.
 * @returns the context text, or an empty string when nothing is selected.
 */
export function renderMaterials(materials: readonly StoryMaterial[]): string {
  if (materials.length === 0) return ''
  const sections = materials.map(material => `### ${material.path}\n\n${material.markdown.trimEnd()}`)
  return [
    'Writing materials selected by the user for this conversation.',
    'Treat these documents as the voice reference and canon they describe; they outrank assumptions formed earlier in the conversation.',
    '',
    ...sections,
  ].join('\n')
}
