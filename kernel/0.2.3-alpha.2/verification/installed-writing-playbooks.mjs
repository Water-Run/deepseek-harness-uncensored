/** Check the installed Writing preset, manuals and retained workspace using the installed Electron in Node mode. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [phase, home, receipt] = process.argv.slice(2)
assert(process.versions.electron && ['seed', 'upgrade', 'reopen'].includes(phase) && isAbsolute(home) && isAbsolute(receipt),
  'Run the installed Electron in Node mode with seed|upgrade|reopen, an absolute fixture directory and an absolute receipt path.')
const archive = join(dirname(process.execPath), 'resources', 'app.asar')
const pkgRoot = join(archive, 'dsh', 'node_modules', '@deepseek-ai')
const bundled = name => import(pathToFileURL(join(pkgRoot, name, 'lib', 'index.js')).href)
const json = async file => JSON.parse(await readFile(file, 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const { dshDisplayVersion: version } = await json(join(archive, 'package.json'))
assert.equal(version, phase === 'seed' ? '2026.11.24.3' : '2026.11.25.0')
const require = createRequire(join(pkgRoot, 'dsh-skill-playbooks', 'package.json'))
const yaml = require('yaml')
const preset = yaml.parse(await readFile(join(pkgRoot, 'dsh-web-app', 'presets', 'writing.patch.yml'), 'utf8'))
const plugins = preset[0].insert.find(row => row.config.id === 'writing').config.plugins
const active = id => {
  const row = plugins.find(item => item.id === id)
  assert(row && !row.disabled, 'Missing Writing plugin ' + id)
  return row
}
const pluginIds = ['agent-instructions', 'time-context', 'memory-agent', 'tool-fs', 'tool-fs-search', 'skill-filesystem',
  'skill-playbooks', 'tool-skill', 'compaction', 'tool-ask-user', 'tool-todo', 'tool-web', 'present']
pluginIds.forEach(active)
assert.equal(active('compaction').config.find(row => row.id === 'tool-result-pruner')?.disabled, true)
const playbooks = active('skill-playbooks')
assert.equal(playbooks.name, '@deepseek-ai/dsh-skill-playbooks')
assert.deepEqual(playbooks.config.packs, ['writing'])

const workspacePath = join(home, 'workspace')
if (phase === 'seed') {
  await mkdir(home)
  await mkdir(workspacePath)
}
const { Context } = await bundled('cordis')
const ctx = new Context()
const { ModeDossiers, writingMaterialsText } = await bundled('dsh-api-mode-dossiers')
const names = ['writing-continuity', 'writing-craft', 'writing-dark', 'writing-longform', 'writing-scene', 'writing-style-reference', 'writing-voice']
const references = {
  'writing-continuity': 'references/story-bible.md',
  'writing-craft': 'references/prose-diagnostics.md',
  'writing-longform': 'references/novel-architecture.md',
  'writing-scene': 'references/scene-checklist.md',
  'writing-style-reference': 'references/style-card.md',
}
const style = 'story/style/voice.md'
const canon = 'story/bible/harbor.md'
const unused = 'story/style/unused.md'
const stored = join(home, 'seed.json')
const signal = AbortSignal.timeout(60_000)
try {
  await ctx.plugin((await bundled('dsh-skill')).default)
  await ctx.plugin(await bundled('dsh-skill-playbooks'), playbooks.config)
  const summaries = await ctx.skills.list()
  assert.deepEqual(summaries.map(item => item.name).sort(), names)
  const manuals = {}
  for (const item of summaries) {
    assert.equal(item.provider, 'dsh-playbooks')
    assert.equal(item.source, 'bundled')
    assert.deepEqual(item.invocation, { modelInvocable: true, userInvocable: true })
    const skill = await ctx.skills.get(item.name)
    assert.equal(skill.resourceBase.kind, 'directory')
    const ref = references[item.name]
    const oldRef = 'writing-continuity/references/story-bible.md'
    let body = skill.content
    if (ref) {
      const expectedRef = phase === 'seed' && item.name === 'writing-continuity' ? oldRef : ref
      assert(body.includes('`' + expectedRef + '`'), 'Incorrect reference in ' + item.name)
      if (phase === 'seed' && item.name === 'writing-continuity') body = body.replace(oldRef, ref)
    }
    manuals[item.name] = {
      description: item.description, whenToUse: item.whenToUse, bodySha256: hash(body),
      ...(ref ? { reference: ref, referenceSha256: hash(await readFile(join(skill.resourceBase.path, ref))) } : {}),
    }
  }
  await ctx.plugin((await bundled('dsh-storage')).default)
  await ctx.plugin(await bundled('dsh-storage-json'), { root: join(home, 'storages') })
  await ctx.plugin(await bundled('dsh-storage-domain'), { backend: 'json' })
  await ctx.plugin(await bundled('dsh-session-persistence-jsonl'), { root: join(home, 'sessions'), compression: 'zstd' })
  await ctx.plugin((await bundled('dsh-workspace')).default)
  const workspace = await ctx.workspaceRegistry.create(workspacePath)
  await ctx.plugin((await bundled('dsh-session')).default)
  await ctx.plugin((await bundled('dsh-session-projection')).default)
  await ctx.plugin((await bundled('dsh-typert-registry')).default)
  await ctx.plugin((await bundled('dsh-fs-local')).LocalFileSystem, { cwd: workspacePath })
  await ctx.plugin(ModeDossiers, { contextBytes: 4096 })
  const scope = { workspaceId: workspace.id }
  const materials = ctx.modeDossiers
  if (phase === 'seed') {
    for (const [section, name, title, markdown] of [
      ['style', 'voice', 'Voice', 'Use short sentences.'], ['bible', 'harbor', 'Harbor', 'The harbor has one bell.'],
      ['style', 'unused', 'Unused', 'Unselected draft.'],
    ]) await materials.createStory({ ...scope, section, name, title, markdown }, signal)
    await materials.selectStory({ ...scope, selected: [style, canon] }, signal)
    await writeFile(stored, JSON.stringify({ workspaceId: workspace.id, manuals }), { flag: 'wx' })
  }
  const prior = await json(stored)
  assert.equal(workspace.id, prior.workspaceId)
  assert.deepEqual(manuals, prior.manuals)
  const { writing } = await materials.inventory(scope, signal)
  assert.deepEqual(writing.entries.map(item => item.path).sort(), [style, canon, unused].sort())
  assert.deepEqual([...writing.selected].sort(), phase === 'reopen' ? [style] : [style, canon].sort())
  const admitted = await writingMaterialsText(ctx.fs, workspacePath, 'writing', 4096, signal)
  assert(admitted.includes(phase === 'reopen' ? 'Vary sentence length.' : 'Use short sentences.'))
  assert.equal(admitted.includes('The harbor has one bell.'), phase !== 'reopen')
  assert(!admitted.includes('Unselected draft.'))
  if (phase === 'upgrade') {
    const previous = await materials.readStory({ ...scope, path: style }, signal)
    await materials.writeStory({ ...scope, path: style, expectedVersion: previous.version, markdown: 'Vary sentence length.' }, signal)
    await materials.selectStory({ ...scope, selected: [style] }, signal)
  }
  const report = { phase, version, workspaceId: workspace.id, pluginIds, manuals, documents: writing.entries.length, selected: writing.selected }
  await writeFile(receipt, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
} finally { await ctx.fiber.dispose() }
