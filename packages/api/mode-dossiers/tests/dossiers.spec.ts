/** Dossier storage over a real filesystem: cases, writing materials, samples. */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { writingMaterialsText } from '../src/index.ts'
import { failureCodeOf, openHarness, signal, WORKSPACE_ID, type Harness } from './harness.ts'

let harness: Harness | undefined

afterEach(async () => {
  await harness?.dispose()
  harness = undefined
})

/** One opened harness. */
async function open(prefix: string): Promise<Harness> {
  harness = await openHarness(prefix)
  return harness
}

describe('dossier scope', () => {
  it('reports that no workspace is selected instead of writing anywhere', async () => {
    const { service } = await open('dsh-dossiers-')
    const inventory = await service.inventory({}, signal())
    expect(inventory.problem?.code).toBe('no-workspace')
    expect(inventory.security.cases).toEqual([])
    expect(inventory.writing.entries).toEqual([])
    expect(inventory.tools.map(tool => tool.id)).toEqual(['case-ledger', 'sample-inventory', 'report'])
  })

  it('names the workspace it manages', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    const inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.workspace).toMatchObject({ workspaceId: WORKSPACE_ID, title: 'Fixture workspace', path: workspace })
    expect(inventory.problem).toBeUndefined()
  })

  it('reports a workspace directory that disappeared', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await rm(workspace, { recursive: true, force: true })
    const inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.problem?.code).toBe('workspace-missing')
  })
})

describe('case ledger', () => {
  it('creates, reads, mutates, and reports one case', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    const created = await service.createCase({
      workspaceId: WORKSPACE_ID, kind: 'security', slug: 'acme', objective: 'Assess acme',
    }, signal())
    expect(created.document).toMatchObject({ kind: 'security', slug: 'acme', objective: 'Assess acme', version: 1 })

    const stored = JSON.parse(await readFile(join(workspace, '.security', 'acme', 'case.json'), 'utf8')) as Record<string, unknown>
    expect(stored).toMatchObject({ version: 1, kind: 'security', slug: 'acme', targets: [] })

    const mutated = await service.mutateCase({
      workspaceId: WORKSPACE_ID, kind: 'security', slug: 'acme', expectedVersion: created.version,
      mutation: { op: 'append', collection: 'targets', record: { value: '10.0.0.5', label: 'web01', note: '' } },
    }, signal())
    expect(mutated.document.targets).toHaveLength(1)
    expect(mutated.version).not.toBe(created.version)

    const report = await service.report({ workspaceId: WORKSPACE_ID, kind: 'security', slug: 'acme' }, signal())
    expect(report.markdown).toContain('## Targets')
    expect(report.markdown).toContain('10.0.0.5')

    const inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.security.cases).toHaveLength(1)
    expect(inventory.security.cases[0]).toMatchObject({ slug: 'acme', targets: 1 })
  })

  it('keeps extension fields written by another tool', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await mkdir(join(workspace, '.reverse', 'bin'), { recursive: true })
    const path = join(workspace, '.reverse', 'bin', 'case.json')
    await writeFile(path, `${JSON.stringify({
      version: 1, kind: 'reverse', slug: 'bin', objective: 'Trace', createdAt: 'a', updatedAt: 'a',
      targets: [{ id: 'T-0001', value: 'sample.bin', label: '', note: '', addedAt: 'a', owner: 'analyst' }],
      evidence: [], findings: [], notes: [], tooling: { ida: '9.2' },
    }, null, 2)}\n`)

    const opened = await service.readCase({ workspaceId: WORKSPACE_ID, kind: 'reverse', slug: 'bin' }, signal())
    expect(opened.extraKeys).toContain('tooling')
    const mutated = await service.mutateCase({
      workspaceId: WORKSPACE_ID, kind: 'reverse', slug: 'bin', expectedVersion: opened.version,
      mutation: { op: 'update', collection: 'targets', id: 'T-0001', record: { value: 'sample2.bin', label: '', note: '' } },
    }, signal())
    expect(mutated.document.targets[0]?.value).toBe('sample2.bin')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    expect(stored.tooling).toEqual({ ida: '9.2' })
    expect((stored.targets as Record<string, unknown>[])[0]?.owner).toBe('analyst')
  })

  it('refuses a write that another window already replaced', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    const created = await service.createCase({
      workspaceId: WORKSPACE_ID, kind: 'security', slug: 'acme', objective: 'One',
    }, signal())
    // A different editor appends a note without going through this service.
    const path = join(workspace, '.security', 'acme', 'case.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
    stored.objective = 'Changed elsewhere'
    await writeFile(path, `${JSON.stringify(stored, null, 2)}\n`)

    const code = await failureCodeOf(service.mutateCase({
      workspaceId: WORKSPACE_ID, kind: 'security', slug: 'acme', expectedVersion: created.version,
      mutation: { op: 'objective', objective: 'Mine' },
    }, signal()))
    expect(code).toBe('mode-dossier/conflict')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ objective: 'Changed elsewhere' })
  })

  it('reports a corrupt ledger beside the usable ones', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await service.createCase({ workspaceId: WORKSPACE_ID, kind: 'security', slug: 'good', objective: 'ok' }, signal())
    await mkdir(join(workspace, '.security', 'bad'), { recursive: true })
    await writeFile(join(workspace, '.security', 'bad', 'case.json'), 'not json')
    const inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.security.cases.map(entry => entry.slug)).toEqual(['good'])
    expect(inventory.security.broken).toHaveLength(1)
    expect(inventory.security.broken[0]?.problem.code).toBe('corrupt')
    expect(await failureCodeOf(service.readCase({ workspaceId: WORKSPACE_ID, kind: 'security', slug: 'bad' }, signal())))
      .toBe('mode-dossier/corrupt')
  })

  it('reports an unknown format version instead of rewriting the file', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await mkdir(join(workspace, '.security', 'future'), { recursive: true })
    const path = join(workspace, '.security', 'future', 'case.json')
    await writeFile(path, JSON.stringify({ version: 9, kind: 'security', slug: 'future' }))
    expect(await failureCodeOf(service.readCase({ workspaceId: WORKSPACE_ID, kind: 'security', slug: 'future' }, signal())))
      .toBe('mode-dossier/unsupported-version')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 9 })
  })

  it('refuses a case name that is not a directory name', async () => {
    const { service } = await open('dsh-dossiers-')
    expect(await failureCodeOf(service.createCase({
      workspaceId: WORKSPACE_ID, kind: 'security', slug: '../escape', objective: '',
    }, signal()))).toBe('mode-dossier/corrupt')
  })
})

describe('writing materials', () => {
  it('creates, selects, adopts, and removes records without deleting documents', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    const created = await service.createStory({
      workspaceId: WORKSPACE_ID, section: 'bible', name: 'characters', title: 'Characters',
      markdown: '# Characters\n\nMara, 34, cartographer.\n',
    }, signal())
    expect(created.path).toBe('story/bible/characters.md')
    expect(await readFile(join(workspace, 'story', 'bible', 'characters.md'), 'utf8')).toContain('Mara')

    await mkdir(join(workspace, 'story', 'style'), { recursive: true })
    await writeFile(join(workspace, 'story', 'style', 'noir.md'), '# Noir\n\nShort sentences.\n')

    let inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.writing.entries.map(entry => entry.path)).toEqual(['story/bible/characters.md'])
    expect(inventory.writing.selected).toEqual(['story/bible/characters.md'])
    expect(inventory.writing.unregistered.map(entry => entry.path)).toEqual(['story/style/noir.md'])

    inventory = await service.adoptStory({ workspaceId: WORKSPACE_ID, path: 'story/style/noir.md' }, signal())
    expect(inventory.writing.entries.map(entry => entry.path)).toEqual([
      'story/bible/characters.md', 'story/style/noir.md',
    ])
    expect(inventory.writing.unregistered).toEqual([])

    await service.selectStory({
      workspaceId: WORKSPACE_ID, selected: ['story/style/noir.md'],
    }, signal())
    inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.writing.selected).toEqual(['story/style/noir.md'])

    await service.removeStory({ workspaceId: WORKSPACE_ID, path: 'story/bible/characters.md' }, signal())
    inventory = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(inventory.writing.entries.map(entry => entry.path)).toEqual(['story/style/noir.md'])
    // The document itself is still the user's.
    expect(await stat(join(workspace, 'story', 'bible', 'characters.md'))).toBeDefined()
  })

  it('refuses to select a path that was never registered', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await mkdir(join(workspace, 'story', 'bible'), { recursive: true })
    await writeFile(join(workspace, 'story', 'bible', 'premise.md'), '# Premise\n')
    expect(await failureCodeOf(service.selectStory({
      workspaceId: WORKSPACE_ID, selected: ['story/bible/premise.md'],
    }, signal()))).toBe('mode-dossier/workspace-missing')
  })

  it('refuses paths outside the managed directories', async () => {
    const { service } = await open('dsh-dossiers-')
    expect(await failureCodeOf(service.readStory({ workspaceId: WORKSPACE_ID, path: '../secret.md' }, signal())))
      .toBe('mode-dossier/unreadable')
    expect(await failureCodeOf(service.readStory({ workspaceId: WORKSPACE_ID, path: 'story/bible/a.txt' }, signal())))
      .toBe('mode-dossier/unreadable')
  })

  it('refuses a write whose document changed since it was opened', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    const created = await service.createStory({
      workspaceId: WORKSPACE_ID, section: 'style', name: 'voice', title: 'Voice', markdown: 'one',
    }, signal())
    await writeFile(join(workspace, 'story', 'style', 'voice.md'), 'two, longer text')
    expect(await failureCodeOf(service.writeStory({
      workspaceId: WORKSPACE_ID, path: created.path, expectedVersion: created.version, markdown: 'mine',
    }, signal()))).toBe('mode-dossier/conflict')
  })

  it('injects only the selected materials into a writing request', async () => {
    const { service, workspace, ctx } = await open('dsh-dossiers-')
    await service.createStory({
      workspaceId: WORKSPACE_ID, section: 'style', name: 'voice', title: 'Voice', markdown: 'VOICE-ONLY',
    }, signal())
    await service.createStory({
      workspaceId: WORKSPACE_ID, section: 'bible', name: 'canon', title: 'Canon', markdown: 'CANON-TEXT',
    }, signal())
    const listing = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(listing.writing.selected).toHaveLength(2)
    await service.selectStory({ workspaceId: WORKSPACE_ID, selected: ['story/style/voice.md'] }, signal())

    const text = await writingMaterialsText(ctx.fs, workspace, 'writing', 4096, signal())
    expect(text).toContain('VOICE-ONLY')
    expect(text).not.toContain('CANON-TEXT')
    expect(text).not.toContain('story/bible/canon.md')

    expect(await writingMaterialsText(ctx.fs, workspace, 'standard', 4096, signal())).toBe('')
    expect(await writingMaterialsText(ctx.fs, workspace, 'writing', 0, signal())).toBe('')
  })
})

describe('sample inventory', () => {
  it('reads one sample without executing it or touching the workspace', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await mkdir(join(workspace, 'samples'), { recursive: true })
    const path = join(workspace, 'samples', 'toy.bin')
    const payload = Buffer.concat([
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      Buffer.from('PAYLOAD-MARKER\u0000\u0001\u0002'),
      Buffer.from([0x00, 0xff, 0x10]),
    ])
    await writeFile(path, payload)

    const inspection = await service.inspectSample({ workspaceId: WORKSPACE_ID, path: 'samples/toy.bin' }, signal())
    expect(inspection).toMatchObject({ path: 'samples/toy.bin', bytes: payload.length, formats: ['elf'] })
    expect(inspection.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(inspection.strings.some(run => run.includes('PAYLOAD-MARKER'))).toBe(true)
    // Nothing was executed and the sample is byte-identical.
    expect(await readFile(path)).toEqual(payload)
    const after = await service.inventory({ workspaceId: WORKSPACE_ID }, signal())
    expect(after.security.cases).toEqual([])
  })

  it('refuses a sample over the read cap', async () => {
    const { service, workspace } = await open('dsh-dossiers-')
    await mkdir(join(workspace, 'samples'), { recursive: true })
    await writeFile(join(workspace, 'samples', 'big.bin'), Buffer.alloc(70 * 1024, 1))
    expect(await failureCodeOf(service.inspectSample({ workspaceId: WORKSPACE_ID, path: 'samples/big.bin' }, signal())))
      .toBe('mode-dossier/unreadable')
  })
})
