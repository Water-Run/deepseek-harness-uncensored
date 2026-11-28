import { spawnSync } from 'node:child_process'
import { globSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, onTestFinished } from 'vitest'
import { buildGates, parseBuildArguments } from './build.ts'

const root = resolve(import.meta.dirname, '..')

const artifactGraph = {
  'native': [],
  'host-typert': [],
  'host-src': ['native', 'host-typert'],
  'host-bundle': ['host-src'],
  'desktop-bundle': ['host-bundle'],
  'client-src': ['desktop-bundle'],
  'client-bundle': ['client-src'],
  'cli-version': ['host-bundle'],
  'web': ['client-bundle'],
}

function graph(gates: ReturnType<typeof buildGates>): Record<string, string[] | undefined> {
  return Object.fromEntries(gates.map(gate => [gate.id, gate.needs]))
}

describe('repository build CLI', () => {
  it('checks each Web e2e file in exactly one compiler project', () => {
    const projects = ['tsconfig.host.json', 'apps/web/tsconfig.json'].map((name) => {
      const project = ts.getParsedCommandLineOfConfigFile(resolve(root, name), {}, {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic(error) { throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n')) },
      })
      if (!project) throw new Error(`Cannot read ${name}`)
      return new Set(project.fileNames.map(file => resolve(file)))
    })
    const tests = globSync('apps/web/tests/**/*.e2e.ts', { cwd: root })
    expect(tests.length).toBeGreaterThan(0)
    expect(tests.filter(file => projects.filter(project => project.has(resolve(root, file))).length !== 1)).toEqual([])
  })

  // The sentinel makes parseArgs fail fast if the check ever stops running first.
  it('rejects a Node process without TypeScript type stripping before any build step', () => {
    const result = spawnSync(
      process.execPath,
      ['--no-experimental-strip-types', '--import', 'tsx/esm', resolve(root, 'scripts/build.ts'), '--spec-sentinel'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('build: Node.js TypeScript type stripping is unavailable')
  })

  it('rejects the removed artifacts-only flag before any build step', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx/esm', resolve(root, 'scripts/build.ts'), '--artifacts-only'],
      { cwd: root, encoding: 'utf8' },
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Unknown option '--artifacts-only'")
  })

  it('selects the complete build by default and one step set by scope', () => {
    expect(parseBuildArguments([])).toEqual({ scope: 'complete', profile: undefined, serial: false })
    expect(parseBuildArguments(['--scope', 'artifacts', '--profile', 'official'])).toEqual({ scope: 'artifacts', profile: 'official', serial: false })
    expect(parseBuildArguments(['--scope', 'check'])).toEqual({ scope: 'check', profile: undefined, serial: false })
    expect(parseBuildArguments(['--scope', 'typecheck'])).toEqual({ scope: 'typecheck', profile: undefined, serial: false })
  })

  it.each([
    [['--scope', 'complete'], '--scope must be artifacts, check, or typecheck'],
    [['--scope', 'lib'], '--scope must be artifacts, check, or typecheck'],
    [['--scope', 'check', '--profile', 'official'], '--profile selects artifact values and does not apply to --scope check'],
    [['--scope', 'typecheck', '--profile', 'official'], '--profile selects artifact values and does not apply to --scope typecheck'],
  ])('rejects %j', (args, message) => {
    expect(() => parseBuildArguments(args)).toThrow(message)
  })
})

describe('repository build steps', () => {
  it.each([
    { stdout: '2026.11.28.0', exitCode: 0, diagnostic: 'Built CLI product version matched 2026.11.28.0' },
    { stdout: '', exitCode: 1, diagnostic: 'printed "", expected "2026.11.28.0"' },
    { stdout: '0.2.3-alpha.2', exitCode: 1, diagnostic: 'printed "0.2.3-alpha.2", expected "2026.11.28.0"' },
  ])('checks the built CLI product version when it prints "$stdout"', ({ stdout, exitCode, diagnostic }) => {
    const fixture = mkdtempSync(join(tmpdir(), 'dshu-cli-version-'))
    onTestFinished(() => rmSync(fixture, { recursive: true, force: true }))
    const lib = join(fixture, 'apps', 'cli', 'lib')
    mkdirSync(lib, { recursive: true })
    writeFileSync(join(fixture, 'product.json'), JSON.stringify({ version: '2026.1128.0' }))
    writeFileSync(join(lib, 'bin.js'), `console.log(${JSON.stringify(stdout)})\n`)
    const gate = buildGates(root, 'artifacts').find(entry => entry.id === 'cli-version')!
    const result = spawnSync(gate.command, [gate.args[0]!, fixture], { encoding: 'utf8', timeout: 30_000 })
    if (result.error !== undefined) throw result.error
    expect(result.signal).toBeNull()
    expect(result.status, result.stderr).toBe(exitCode)
    expect(exitCode === 0 ? result.stdout : result.stderr).toContain(diagnostic)
  }, 40_000)

  it('parses the explicit serial build option', () => {
    expect(parseBuildArguments(['--profile', 'official', '--serial'])).toEqual({ scope: 'complete', profile: 'official', serial: true })
  })

  it.each(['complete', 'artifacts', 'check', 'typecheck'] as const)('chains every %s step when serial execution is selected', (scope) => {
    const original = buildGates(root, scope)
    const serial = buildGates(root, scope, {}, true)
    expect(serial.map(gate => gate.id)).toEqual(original.map(gate => gate.id))
    for (const [index, gate] of serial.entries()) {
      const previous = serial[index - 1]
      if (previous !== undefined) expect(gate.needs).toContain(previous.id)
      for (const dependency of original[index]!.needs ?? []) expect(gate.needs).toContain(dependency)
    }
  })

  it.each(['complete', 'check', 'typecheck'] as const)('gives Host compilers and both aggregate checks an 8 GiB heap in %s scope', (scope) => {
    const gates = buildGates(root, scope)
    for (const gate of gates.filter(gate => gate.id === 'host-src' || gate.id === 'host-check' || gate.id === 'client-check')) {
      expect(gate.args[0]).toBe('--max-old-space-size=8192')
    }
    for (const gate of gates.filter(gate => gate.id === 'client-src')) {
      expect(gate.args.some(arg => arg.startsWith('--max-old-space-size'))).toBe(false)
    }
  })

  it('finishes Host and Desktop readers before Client compilation rewrites shared outputs', () => {
    expect(graph(buildGates(root, 'artifacts'))).toEqual(artifactGraph)
  })

  it('checks both aggregate programs without artifact predecessors', () => {
    const gates = buildGates(root, 'check')
    expect(graph(gates)).toEqual({ 'host-check': [], 'client-check': [] })
    expect(gates.map(gate => gate.args.slice(-2))).toEqual([
      ['-p', 'tsconfig.host.json'],
      ['-p', 'tsconfig.client.json'],
    ])
  })

  it('starts each aggregate check after its own package compilation in the complete build', () => {
    expect(graph(buildGates(root, 'complete'))).toEqual({
      ...artifactGraph,
      'host-check': ['host-src'],
      'client-check': ['client-src'],
    })
  })

  it('type-checks every program after source-only Typert generation', () => {
    const gates = buildGates(root, 'typecheck')
    expect(graph(gates)).toEqual({
      'host-typert': [],
      'host-src': ['host-typert'],
      'client-src': ['host-src'],
      'host-check': ['host-src'],
      'client-check': ['client-src'],
    })
    expect(gates.find(gate => gate.id === 'host-typert')?.args.at(-1)).toBe(resolve(root, 'scripts/generate-typert.ts'))
    expect(gates.filter(gate => gate.id.endsWith('-check')).map(gate => gate.args.slice(-2))).toEqual([
      ['-b', 'tsconfig.host.json'],
      ['-b', 'tsconfig.client.json'],
    ])
  })

  it('applies the environment overlay to every step', () => {
    const environment = { DSH_CLIENT_TITLE: 'Title', DSH_BUILD_CLIENT_PROFILE: undefined }
    for (const gate of buildGates(root, 'complete', environment)) expect(gate.env).toEqual(environment)
  })
})
