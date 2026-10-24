import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillPlaybooks from '@deepseek-ai/dsh-skill-playbooks'
import { describe, expect, it } from 'vitest'

const assets = fileURLToPath(new URL('../assets/', import.meta.url))
const scripts = join(assets, 'shared', 'scripts')

async function withContext(run: (ctx: Context) => Promise<void>, packs: ('security' | 'reverse' | 'writing')[]): Promise<void> {
  const ctx = new Context()
  try {
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillPlaybooks, { packs })
    await run(ctx)
  } finally {
    await ctx.fiber.dispose()
  }
}

describe('playbook provider', () => {
  it('mounts only the configured pack and sorts the catalog by name', async () => {
    await withContext(async (ctx) => {
      const catalog = await ctx.skills.list()
      expect(catalog.length).toBeGreaterThan(0)
      expect(catalog.every(skill => skill.name.startsWith('security-'))).toBe(true)
      expect(catalog.map(skill => skill.name)).toEqual([...catalog.map(skill => skill.name)].sort((a, b) => a.localeCompare(b)))
      for (const skill of catalog) {
        expect(skill).toMatchObject({
          source: 'bundled',
          provider: 'dsh-playbooks',
          invocation: { modelInvocable: true, userInvocable: true },
        })
        expect(skill.description.length).toBeGreaterThan(20)
        expect(skill.description.length).toBeLessThanOrEqual(500)
      }
    }, ['security'])
  })

  it('exposes the reverse and writing packs without leaking names across packs', async () => {
    await withContext(async (ctx) => {
      const names = (await ctx.skills.list()).map(skill => skill.name)
      expect(names).toContain('reverse-triage')
      expect(names).not.toContain('security-recon')
    }, ['reverse'])
    await withContext(async (ctx) => {
      const names = (await ctx.skills.list()).map(skill => skill.name)
      expect(names).toContain('writing-scene')
      expect(names).not.toContain('reverse-triage')
    }, ['writing'])
  })

  it('loads a body from disk with a directory resource base', async () => {
    await withContext(async (ctx) => {
      const skill = await ctx.skills.get('security-engagement')
      expect(skill?.content).toContain('Security engagement playbook')
      expect(skill?.resourceBase).toEqual({
        kind: 'directory',
        path: join(assets, 'security', 'security-engagement').split(sep).join('/'),
      })
      const raw = await readFile(join(assets, 'security', 'security-engagement', 'SKILL.md'), 'utf8')
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '').trim()
      expect(skill?.content).toBe(body)
    }, ['security'])
  })

  it('registers nothing when no pack is requested', async () => {
    await withContext(async (ctx) => {
      expect(await ctx.skills.list()).toEqual([])
    }, [])
  })

  it('removes every candidate on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(SkillPlaybooks, { packs: ['writing'] })
      expect((await ctx.skills.list()).length).toBeGreaterThan(0)
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('fails loud for a missing pack and a relative asset root', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      expect(() => { SkillPlaybooks.apply(ctx, { packs: ['security'], assetRoot: join(tmpdir(), 'dsh-playbooks-absent') }) }).toThrow(/missing at/u)
      expect(() => { SkillPlaybooks.apply(ctx, { packs: ['security'], assetRoot: 'assets' }) }).toThrow(/absolute/u)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects malformed playbook assets instead of silently mounting them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-playbooks-invalid-'))
    const ctx = new Context()
    try {
      await mkdir(join(root, 'security', 'broken-skill'), { recursive: true })
      await writeFile(join(root, 'security', 'broken-skill', 'SKILL.md'), '# no frontmatter\n')
      await ctx.plugin(SkillRegistry)
      expect(() => { SkillPlaybooks.apply(ctx, { packs: ['security'], assetRoot: root }) }).toThrow(/frontmatter/u)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('loads through a real cordis.yml composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-playbooks-'))
    const ctx = new Context()
    try {
      const configPath = join(root, 'cordis.yml')
      await writeFile(configPath, [
        "- name: '@deepseek-ai/dsh-skill'",
        "- name: '@deepseek-ai/dsh-skill-playbooks'",
        '  config:',
        '    packs:',
        '      - reverse',
        '',
      ].join('\n'))
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['@deepseek-ai/dsh-skill', SkillRegistry],
        ['@deepseek-ai/dsh-skill-playbooks', SkillPlaybooks],
      ])
      ctx.loader.internal = {
        version: 'v2',
        loadCache: new Map(),
        register() { throw new Error('unexpected register') },
        getOrCreateModuleJob() { throw new Error('unexpected module job') },
        resolveSync() { throw new Error('unexpected resolution') },
        load() { throw new Error('unexpected load') },
        async import(specifier: string) {
          if (!modules.has(specifier)) throw new Error(`Unexpected Loader import: ${specifier}`)
          return modules.get(specifier)
        },
      }
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
      await ctx.loader.await()
      const names = (await ctx.skills.list()).map(skill => skill.name)
      expect(names).toContain('reverse-casebook')
      expect(names).not.toContain('writing-craft')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('playbook scripts', () => {
  it('maintains an engagement ledger and renders a report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-casefile-'))
    const casefile = join(scripts, 'casefile.mjs')
    const run = (...args: string[]): string => execFileSync(process.execPath, [casefile, ...args, '--root', root], { encoding: 'utf8' })
    try {
      const initPath = run('init', '--kind', 'security', '--slug', 'acme', '--objective', 'prove the ledger').trim()
      expect(initPath).toBe(join(root, '.security', 'acme', 'case.json'))
      const target = JSON.parse(run('target', 'add', '--slug', 'acme', '--value', '10.0.0.5', '--label', 'web01')) as { id: string }
      expect(target.id).toBe('T-0001')
      const evidence = JSON.parse(run('evidence', 'add', '--slug', 'acme', '--type', 'http', '--ref', 'GET /api')) as { id: string }
      expect(evidence.id).toBe('E-0001')
      const finding = JSON.parse(run(
        'finding', 'add', '--slug', 'acme', '--title', 'IDOR', '--severity', 'high', '--evidence', 'E-0001', '--cvss', '8.1',
      )) as { id: string; severity: string }
      expect(finding).toMatchObject({ id: 'F-0001', severity: 'high' })
      const status = run('status', '--slug', 'acme')
      expect(status).toContain('targets: 1')
      expect(status).toContain('findings: 1')
      const report = run('report', '--slug', 'acme')
      expect(report).toContain('## Findings')
      expect(report).toContain('| F-0001 | IDOR | high | 8.1 |')
      expect(report).toContain('E-0001')
      const written = run('report', '--slug', 'acme', '--out', join(root, 'out', 'report.md')).trim()
      expect(await readFile(written, 'utf8')).toContain('IDOR')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects an unknown evidence reference and an unknown severity', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-casefile-invalid-'))
    const casefile = join(scripts, 'casefile.mjs')
    const run = (...args: string[]): string => execFileSync(process.execPath, [casefile, ...args, '--root', root], { encoding: 'utf8', stdio: 'pipe' })
    try {
      run('init', '--slug', 'acme')
      expect(() => run('finding', 'add', '--slug', 'acme', '--title', 'x', '--severity', 'urgent')).toThrow(/severity/u)
      expect(() => run('finding', 'add', '--slug', 'acme', '--title', 'x', '--severity', 'high', '--evidence', 'E-9999')).toThrow(/unknown evidence/u)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('inventories a sample with real hashes and format detection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-sample-'))
    const sample = join(scripts, 'sample.mjs')
    try {
      const body = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('MARKER_STRING_XYZ'.repeat(15), 'latin1')])
      const path = join(root, 'sample.bin')
      await writeFile(path, body)
      const inventory = JSON.parse(execFileSync(process.execPath, [sample, path, '--max', '5'], { encoding: 'utf8' })) as {
        size: number
        format: string
        hashes: { sha256: string }
        entropy: number
        strings: string[]
      }
      expect(inventory.size).toBe(body.length)
      expect(inventory.format).toBe('PE')
      expect(inventory.hashes.sha256).toBe(createHash('sha256').update(body).digest('hex'))
      expect(inventory.entropy).toBeGreaterThan(0)
      expect(inventory.strings.some(value => value.includes('MARKER_STRING_XYZ'))).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('asset integrity', () => {
  const packs = ['security', 'reverse', 'writing'] as const
  const presets = fileURLToPath(new URL('../../../bundle/web-app/presets/', import.meta.url))

  it('ships every file a playbook points at', async () => {
    for (const pack of packs) {
      const directories = (await readdir(join(assets, pack), { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
      expect(directories.length).toBeGreaterThan(0)
      for (const directory of directories) {
        const raw = await readFile(join(assets, pack, directory, 'SKILL.md'), 'utf8')
        const references = [...raw.matchAll(/(?:references|templates)\/[A-Za-z0-9._/-]+\.md/gu)].map(match => match[0])
        for (const reference of references) {
          const content = await readFile(join(assets, pack, directory, reference), 'utf8')
          expect(content.length, `${pack}/${directory} -> ${reference}`).toBeGreaterThan(0)
        }
        const scriptNames = [...raw.matchAll(/(?:\.\.\/\.\.\/)?shared\/scripts\/([A-Za-z0-9._-]+\.mjs)/gu)].flatMap(match => match[1] ?? [])
        for (const script of scriptNames) {
          const content = await readFile(join(scripts, script), 'utf8')
          expect(content.length, `${pack}/${directory} -> ${script}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('mounts the matching pack in each specialized preset', async () => {
    for (const pack of packs) {
      const raw = await readFile(join(presets, `${pack}.patch.yml`), 'utf8')
      expect(raw).toContain('id: skill-playbooks')
      expect(raw).toContain("name: '@deepseek-ai/dsh-skill-playbooks'")
      const start = raw.indexOf('id: skill-playbooks')
      expect(raw.slice(start, start + 400)).toContain(`- ${pack}`)
      for (const match of raw.matchAll(/shared\/scripts\/[A-Za-z0-9._-]+\.mjs/gu)) {
        const start = Math.max(0, (match.index ?? 0) - 6)
        expect(raw.slice(start, (match.index ?? 0) + match[0].length), `${pack} preset script path`)
          .toMatch(/^\.\.\/\.\.\/shared\/scripts\//u)
      }
    }
    const standard = await readFile(join(presets, 'standard.patch.yml'), 'utf8')
    expect(standard).not.toContain('dsh-skill-playbooks')
  })
})
