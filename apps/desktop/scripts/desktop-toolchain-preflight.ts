/** Check archive round trips and Windows native preparation without modifying installed tools. */

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** One tool the packaging run requires, and what went wrong with it. */
export interface DesktopToolchainProbeFailure {
  readonly tool: string
  readonly detail: string
}

async function probeTar(): Promise<string | undefined> {
  // GNU tar reads the colon in an absolute Windows path as a remote-host separator, which the
  // release scripts avoid by running beside the archive; this probe confirms the archive reader works there.
  const directory = await mkdtemp(join(tmpdir(), 'dsh-tar-probe-'))
  try {
    const member = join(directory, 'probe.txt')
    await writeFile(member, 'probe\n')
    const archive = join(directory, 'probe.tar.gz')
    await run('tar', ['-czf', basename(archive), basename(member)], { cwd: directory, windowsHide: true, timeout: 20_000 })
    const listed = await run('tar', ['-tzf', basename(archive)], { cwd: dirname(archive), windowsHide: true, timeout: 20_000 })
    if (!listed.stdout.includes('probe.txt')) return `tar listed ${JSON.stringify(listed.stdout)} instead of the archived member`
    return undefined
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function probeWindowsRuntimeToolchain(installation: string, environment: NodeJS.ProcessEnv): Promise<string | undefined> {
  const directory = await mkdtemp(join(tmpdir(), 'dshu-msvc-probe-'))
  try {
    const project = join(directory, 'probe.vcxproj')
    await writeFile(project, `<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="PrepareForBuild" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup Label="ProjectConfigurations">
    <ProjectConfiguration Include="Release|x64">
      <Configuration>Release</Configuration><Platform>x64</Platform>
    </ProjectConfiguration>
  </ItemGroup>
  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />
  <PropertyGroup>
    <ConfigurationType>Application</ConfigurationType>
    <PlatformToolset>$(DefaultPlatformToolset)</PlatformToolset>
  </PropertyGroup>
  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.props" />
  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />
  <Target Name="DescribeToolchain" BeforeTargets="PrepareForBuild">
    <Message Importance="high" Text="DSHU toolchain: $(VCToolsVersion); SDK: $(WindowsTargetPlatformVersion)" />
  </Target>
</Project>
`)
    await run(join(installation, 'MSBuild/Current/Bin/MSBuild.exe'), [project,
      '/nologo', '/verbosity:minimal', '/nodeReuse:false', '/maxcpucount:1', '/target:PrepareForBuild',
      '/p:Configuration=Release;Platform=x64;SpectreMitigation=Spectre;CheckMSVCComponents=true',
    ], { cwd: directory, env: environment, windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 })
    return undefined
  } catch (error) {
    const output = error instanceof Error && 'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : ''
    const reason = error instanceof Error ? error.message : String(error)
    return 'Windows native runtime preparation failed. Check the diagnostic below. For MSB8040, install matching x64 Spectre libraries '
      + `or select a complete toolset with VCToolsVersion (and MSVCPreviewEnabled=true for Preview).\n${reason}\n${output}`
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

async function probeWindowsToolchain(environment: NodeJS.ProcessEnv): Promise<DesktopToolchainProbeFailure[]> {
  const failures: DesktopToolchainProbeFailure[] = []
  const programFiles = environment['ProgramFiles(x86)']
  const vswhere = programFiles === undefined
    ? undefined
    : join(programFiles, 'Microsoft Visual Studio/Installer/vswhere.exe')
  if (vswhere === undefined) {
    failures.push({ tool: 'vswhere', detail: 'ProgramFiles(x86) is not set, so Visual Studio cannot be located' })
  }
  else {
    let installation: string
    try {
      const located = await run(vswhere, ['-latest', '-prerelease', '-products', '*',
        '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
      { env: environment, windowsHide: true, timeout: 30_000 })
      installation = located.stdout.trim()
    }
    catch (error) {
      failures.push({ tool: 'vswhere', detail: error instanceof Error ? error.message : String(error) })
      return failures
    }
    if (installation === '') {
      failures.push({ tool: 'vswhere', detail: 'Visual Studio C++ build tools are required for the Windows runtime and installer helpers' })
    } else {
      const native = await probeWindowsRuntimeToolchain(installation, environment)
      if (native !== undefined) failures.push({ tool: 'MSVC/Spectre', detail: native })
    }
  }
  return failures
}

/**
 * Probe archive access and Windows native preparation before packaging.
 * @param platform - Target platform; a Windows target already requires a Windows build host.
 * @param environment - Packaging environment used to locate Windows tooling.
 * @returns Every failed probe; successful preparation does not replace compilation and packaged-runtime checks.
 */
export async function probeDesktopToolchain(
  platform: 'darwin' | 'win32' | 'linux',
  environment: NodeJS.ProcessEnv = process.env,
): Promise<readonly DesktopToolchainProbeFailure[]> {
  const failures: DesktopToolchainProbeFailure[] = []
  const tar = await probeTar()
  if (tar !== undefined) failures.push({ tool: 'tar', detail: tar })
  if (platform === 'win32') failures.push(...await probeWindowsToolchain(environment))
  if (platform === 'linux') {
    for (const tool of ['cc', 'musl-gcc']) {
      try { await run(tool, ['--version'], { env: environment, windowsHide: true, timeout: 20_000 }) }
      catch (error) {
        failures.push({ tool, detail: `Linux native packaging requires ${tool}. Install the C compiler and musl development tools. `
          + (error instanceof Error ? error.message : String(error)) })
      }
    }
  }
  return failures
}

/**
 * Probe the toolchain and fail with every problem the host has.
 * Windows directory and preparation-only builds also require the native runtime toolchain.
 * @param platform - Target platform; a Windows target already requires a Windows build host.
 * @param environment - Packaging environment used to locate Windows tooling.
 * @returns Resolves when every probe passes.
 */
export async function requireDesktopToolchain(
  platform: 'darwin' | 'win32' | 'linux',
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const failures = await probeDesktopToolchain(platform, environment)
  if (failures.length === 0) return
  throw new Error(`desktop package: the build host cannot run this packaging sequence:\n${
    failures.map(failure => `  ${failure.tool}: ${failure.detail}`).join('\n')}`)
}
