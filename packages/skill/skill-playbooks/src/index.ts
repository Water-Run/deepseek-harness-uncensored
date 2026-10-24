/**
 * Bundled field manuals for the specialized session modes.
 *
 * This package is one provider of the `ctx.skills` registry. It ships three
 * original playbook packs — security operations, reverse engineering, and
 * fiction craft — and a preset mounts exactly the pack its mode needs. The
 * catalog summary is always visible; a full playbook body, its references, and
 * its helper scripts load only when the model selects the skill.
 *
 * Playbook text is first-party work of this fork. Third-party tools are named,
 * never vendored: no external code is copied into these assets, so the pack
 * carries no upstream license obligation beyond the repository's own.
 *
 * @module @deepseek-ai/dsh-skill-playbooks
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BUNDLED_SKILL_RANK, isSkillName, type SkillCandidate, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { parse as parseYaml } from 'yaml'

/** Stable Cordis plugin name. */
export const name = 'skill-playbooks'

/** Registry used by the bundled provider. */
export const inject = ['skills']

/** Pack identifiers shipped by this package. */
export const PACK_IDS = ['security', 'reverse', 'writing'] as const

/** One shipped playbook pack. */
export type PackId = (typeof PACK_IDS)[number]

/** Provider name registered with `ctx.skills`. */
export const PROVIDER_NAME = 'dsh-playbooks'

/** Playbook resource location and the packs this mount exposes. */
export interface Config {
  /**
   * Packs to expose. Empty or omitted mounts no provider at all, which keeps
   * this package inert for compositions that want only local discovery.
   */
  packs?: PackId[]
  /** Absolute assets directory containing `security/`, `reverse/`, and `writing/`; defaults to packaged assets. */
  assetRoot?: string
}

/** Validated playbook configuration. */
export const Config: z<Config> = z.object({
  packs: z.array(z.union([z.const('security'), z.const('reverse'), z.const('writing')])).default([]),
  assetRoot: z.string().min(1),
})

interface PlaybookDocument {
  description: string
  whenToUse?: string
  content: string
}

/**
 * Split one playbook file into its routing metadata and instruction body.
 * @param raw - complete file text including YAML frontmatter.
 * @param path - absolute path used in diagnostics.
 * @returns the parsed description, optional routing hint, and body.
 */
export function parsePlaybook(raw: string, path: string): PlaybookDocument {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`skill-playbooks: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  if (typeof metadata !== 'object' || metadata === null) throw new Error(`skill-playbooks: ${path} has invalid YAML frontmatter`)
  const description = 'description' in metadata ? metadata.description : undefined
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`skill-playbooks: ${path} has no description`)
  }
  const whenToUse = 'whenToUse' in metadata && typeof metadata.whenToUse === 'string' && metadata.whenToUse.length > 0
    ? metadata.whenToUse
    : undefined
  return {
    description,
    ...(whenToUse === undefined ? {} : { whenToUse }),
    content: raw.slice(frontmatter[0].length).trim(),
  }
}

/**
 * Read one pack's skill directories and build catalog candidates.
 * @param assetRoot - absolute directory that contains the pack folders.
 * @param pack - pack whose skill folders are collected.
 * @returns the pack candidates in stable name order.
 */
function discoverPack(assetRoot: string, pack: PackId): { name: string; directory: string; path: string; document: PlaybookDocument }[] {
  const packRoot = join(assetRoot, pack)
  if (!statSync(packRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`skill-playbooks: pack "${pack}" is missing at ${packRoot}`)
  }
  const directories = readdirSync(packRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right))
  if (directories.length === 0) throw new Error(`skill-playbooks: pack "${pack}" has no skill directories at ${packRoot}`)
  return directories.map((directory) => {
    if (!isSkillName(directory)) throw new Error(`skill-playbooks: pack "${pack}" has invalid skill directory "${directory}"`)
    const skillDirectory = join(packRoot, directory)
    const path = join(skillDirectory, 'SKILL.md')
    const document = parsePlaybook(readFileSync(path, 'utf8'), path)
    return { name: directory, directory: skillDirectory, path, document }
  })
}

/** Whether a filesystem error means the playbook file no longer exists. */
function isAbsentPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/**
 * Mount the configured playbook packs as bundled skills.
 * @param ctx - context carrying the skill registry.
 * @param config - packs to expose and an optional relocated assets directory.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url))
  if (!isAbsolute(assetRoot)) throw new Error('skill-playbooks: assetRoot must be an absolute directory')
  const packs = config.packs ?? []
  if (packs.length === 0) return
  const discovered = packs.flatMap(pack => discoverPack(assetRoot, pack))
  const names = new Set<string>()
  for (const skill of discovered) {
    if (names.has(skill.name)) throw new Error(`skill-playbooks: duplicate skill name "${skill.name}" across configured packs`)
    names.add(skill.name)
  }
  const candidates: SkillCandidate[] = discovered.map(skill => ({
    name: skill.name,
    description: skill.document.description,
    ...(skill.document.whenToUse === undefined ? {} : { whenToUse: skill.document.whenToUse }),
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER_NAME,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: 'directory', path: skill.directory.split(sep).join('/') },
    locator: skill.path,
  }))
  const byName = new Map(candidates.map(candidate => [candidate.name, candidate]))
  const provider: SkillProvider = {
    name: PROVIDER_NAME,
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const located = byName.get(candidate.name)
      if (located === undefined) return undefined
      const path = located.locator as string
      let raw: string
      try {
        raw = await readFile(path, { encoding: 'utf8', signal: options.signal })
      } catch (error) {
        if (isAbsentPathError(error)) return undefined
        throw error
      }
      const document = parsePlaybook(raw, path)
      const { rank: _rank, locator: _locator, ...summary } = located
      return { ...summary, content: document.content }
    },
  }
  ctx.skills.registerProvider(() => provider)
}
