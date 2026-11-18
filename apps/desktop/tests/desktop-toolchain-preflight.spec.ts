/** Native preparation failures stop packaging without retaining probe outputs. */
import type { ExecFileOptions } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { probeDesktopToolchain, requireDesktopToolchain } from '../scripts/desktop-toolchain-preflight.ts'

const { execute } = vi.hoisted(() => ({
  execute: vi.fn<(file: string, args: readonly string[], options: ExecFileOptions) => Promise<{ stdout: string; stderr: string }>>(),
}))
vi.mock('node:child_process', async (importOriginal) => {
  const { promisify } = await import('node:util')
  return { ...await importOriginal<typeof import('node:child_process')>(),
    execFile: Object.assign(vi.fn(), { [promisify.custom]: execute }) }
})
afterEach(() => { vi.resetAllMocks() })

const environment = { 'ProgramFiles(x86)': 'fixture-programs', VCToolsVersion: '14.52.fixture', MSVCPreviewEnabled: 'true' }

function commands(native: (project: string, options: ExecFileOptions, args: readonly string[]) => Promise<void>): void {
  execute.mockImplementation(async (file, args, options) => {
    if (file === 'tar') return { stdout: 'probe.txt\n', stderr: '' }
    if (basename(file) === 'vswhere.exe') return { stdout: 'fixture-visual-studio\n', stderr: '' }
    expect(basename(file)).toBe('MSBuild.exe')
    const project = args[0]
    if (project === undefined) throw new Error('Missing native probe project')
    await native(project, options, args)
    return { stdout: '', stderr: '' }
  })
}

it('prepares x64 Spectre under the packaging environment and removes its private project', async () => {
  const projects: string[] = []
  commands(async (project, options, args) => {
    projects.push(project)
    expect(options).toMatchObject({ env: environment, windowsHide: true })
    expect(args).toContain('/target:PrepareForBuild')
    expect(args).toContain('/nodeReuse:false')
    expect(args).toContain('/maxcpucount:1')
    expect(args).toContain('/p:Configuration=Release;Platform=x64;SpectreMitigation=Spectre;CheckMSVCComponents=true')
    const xml = await readFile(project, 'utf8')
    expect(xml).toContain('ProjectConfiguration Include="Release|x64"')
    expect(xml).toContain('$(DefaultPlatformToolset)')
    expect(xml).not.toContain('<ClCompile')
  })
  expect(await probeDesktopToolchain('win32', environment)).toEqual([])
  expect(projects).toHaveLength(1)
  for (const project of projects) await expect(stat(dirname(project))).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each(['MSB8040: matching Spectre libraries are missing', 'MSB8036: requested Windows SDK is unavailable'])(
  'reports the native failure and retains its diagnostic: %s', async (diagnostic) => {
    const projects: string[] = []
    commands(async (project) => {
      projects.push(project)
      throw Object.assign(new Error('MSBuild exited with code 1'), { stdout: diagnostic })
    })
    const failures = await probeDesktopToolchain('win32', environment)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.tool).toBe('MSVC/Spectre')
    expect(failures[0]?.detail).toContain(diagnostic)
    expect(failures[0]?.detail).toContain('VCToolsVersion')
    await expect(requireDesktopToolchain('win32', environment)).rejects.toThrow(diagnostic)
    for (const project of projects) await expect(stat(dirname(project))).rejects.toMatchObject({ code: 'ENOENT' })
  },
)

it('stops after Visual Studio discovery fails', async () => {
  execute.mockImplementation(async (file) => {
    if (file === 'tar') return { stdout: 'probe.txt', stderr: '' }
    expect(basename(file)).toBe('vswhere.exe')
    throw new Error('Visual Studio discovery failed')
  })
  expect(await probeDesktopToolchain('win32', environment)).toEqual([
    { tool: 'vswhere', detail: 'Visual Studio discovery failed' },
  ])
})

it('reports missing C++ tools before attempting native preparation', async () => {
  execute.mockImplementation(async file => ({ stdout: file === 'tar' ? 'probe.txt' : '', stderr: '' }))
  await expect(requireDesktopToolchain('win32', environment)).rejects.toThrow('Windows runtime and installer helpers')
  expect(execute.mock.calls.some(([file]) => basename(file) === 'MSBuild.exe')).toBe(false)
})

it('checks the Linux C and musl compilers before building native payloads', async () => {
  execute.mockImplementation(async (file) => {
    if (file === 'musl-gcc') throw new Error('musl-gcc not found')
    return { stdout: file === 'tar' ? 'probe.txt' : 'compiler version', stderr: '' }
  })
  const failures = await probeDesktopToolchain('linux', { PATH: 'build-tools' })
  expect(failures).toHaveLength(1)
  expect(failures[0]?.tool).toBe('musl-gcc')
  expect(failures[0]?.detail).toContain('musl-gcc not found')
  expect(execute.mock.calls.some(([file]) => file === 'cc')).toBe(true)
})

it('rejects a musl compiler that reports a version but cannot link the static program', async () => {
  execute.mockImplementation(async (file, args) => {
    if (file === 'musl-gcc' && args.includes('-static')) throw new Error('cannot find the musl static library')
    return { stdout: file === 'tar' ? 'probe.txt' : 'compiler available', stderr: '' }
  })
  const failures = await probeDesktopToolchain('linux', { PATH: 'build-tools' })
  expect(failures).toHaveLength(1)
  expect(failures[0]?.tool).toBe('musl-gcc')
  expect(failures[0]?.detail).toContain('cannot find the musl static library')
})

it('links both Linux musl outputs using the selected PATH and cleans the probe directory', async () => {
  const environment = { PATH: 'private-build-tools' }
  const invocations: { args: readonly string[]; source: string }[] = []
  execute.mockImplementation(async (file, args, options) => {
    if (file === 'tar') return { stdout: 'probe.txt', stderr: '' }
    expect(options.env).toEqual(environment)
    if (file === 'cc') {
      expect(args).toEqual(['--version'])
      return { stdout: 'compiler version', stderr: '' }
    }
    expect(file).toBe('musl-gcc')
    const source = args.at(-1)!
    expect(await readFile(source, 'utf8')).toContain('#ifdef __GLIBC__')
    await writeFile(args[args.indexOf('-o') + 1]!, 'fixture output')
    invocations.push({ args, source })
    return { stdout: '', stderr: '' }
  })
  await expect(probeDesktopToolchain('linux', environment)).resolves.toEqual([])
  expect(invocations).toHaveLength(2)
  expect(invocations[0]!.args).toContain('-static')
  expect(invocations[1]!.args).toEqual(expect.arrayContaining(['-shared', '-fPIC', '-Wl,-z,defs']))
  await expect(stat(dirname(invocations[0]!.source))).rejects.toMatchObject({ code: 'ENOENT' })
})
