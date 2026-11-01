/** Checks for the retained GitLab declarations, local preparation script and Git hooks. */

import { readFileSync } from 'node:fs'

import { resolve } from 'node:path'

import * as yaml from 'js-yaml'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('bubblewrap preparation script', () => {
  it('pins bubblewrap to a recorded Launchpad build and excludes Ubuntu pool downloads', () => {
    const script = readFileSync(resolve(root, 'scripts/prepare-ci-bubblewrap.sh'), 'utf8')
    const url = /^readonly BUBBLEWRAP_URL="([^"]+)"$/mu.exec(script)?.[1]

    expect(url).toMatch(
      /^https:\/\/launchpad\.net\/ubuntu\/\+source\/bubblewrap\/[^/]+\/\+build\/\d+\/\+files\/bubblewrap_[^/]+_amd64\.deb$/u,
    )
    // Ubuntu removes superseded versions from its live package pool.
    expect(script).not.toMatch(/https?:\/\/[^/'"\s]+\/ubuntu(?:-ports)?\/pool\//u)
  })
})

describe('GitLab runtime declarations', () => {
  it('uses the shared macOS deployment-target check in GitLab', () => {
    const workflow = loadWorkflow('.gitlab-ci.yml')
    const runtimeWheel = workflow['.runtime-wheel']
    if (!isRecord(runtimeWheel) || !Array.isArray(runtimeWheel.script)) {
      throw new TypeError('GitLab CI must define the runtime wheel script')
    }
    const runtimeScript: unknown[] = runtimeWheel.script
    const macosCheck = runtimeScript.find(
      step => typeof step === 'string' && step.includes('${PLATFORM#macos-}'),
    )
    if (typeof macosCheck !== 'string') {
      throw new TypeError('GitLab CI must check the macOS deployment target')
    }

    expect(macosCheck).toContain('scripts/check-macos-deployment-target.py')
    expect(macosCheck).toContain('lipo "$payload" -verify_arch')
    expect(macosCheck).toContain('"$EXE" "$EXE-rg" "$EXE-spawn-helper"')
  })

  it('builds the macOS x64 wheel on the matching GitLab runner', () => {
    const workflow = loadWorkflow('.gitlab-ci.yml')
    const macosX64 = workflow['runtime-macos-x64']
    const publish = workflow['publish-python']
    if (!isRecord(macosX64) || !isRecord(publish) || !Array.isArray(publish.needs)) {
      throw new TypeError('GitLab CI must define the macOS x64 runtime and publication jobs')
    }

    expect(macosX64.tags).toEqual(['macos-x64'])
    expect(macosX64.variables).toMatchObject({ PKG_TARGET: 'node24-macos-x64', PLATFORM: 'macos-x64' })
    expect(publish.needs).toContainEqual({ job: 'runtime-macos-x64', artifacts: true })
    expect(JSON.stringify(publish.script)).toContain('macosx_14_0_x86_64.whl')
  })

  it('builds and black-box tests the Windows x64 wheel in GitLab', () => {
    const workflow = loadWorkflow('.gitlab-ci.yml')
    const windows = workflow['runtime-windows-x64']
    const publish = workflow['publish-python']
    if (!isRecord(windows) || !Array.isArray(windows.before_script) || !Array.isArray(windows.script)
      || !isRecord(publish) || !Array.isArray(publish.needs)) {
      throw new TypeError('GitLab CI must define the Windows runtime and aggregate publication jobs')
    }

    expect(windows.tags).toEqual(['windows-x64'])
    expect(windows.variables).toMatchObject({ PKG_TARGET: 'node24-win-x64', PLATFORM: 'win-x64' })
    expect(JSON.stringify(windows.before_script)).toContain('.ci-python\\\\Scripts')
    expect(JSON.stringify(windows.before_script)).toContain('[IO.Path]::PathSeparator')
    expect(JSON.stringify(windows.script)).toContain('win_amd64.whl')
    expect(JSON.stringify(windows.script)).toContain('--scenario all --installed-wheel')
    expect(publish.needs).toContainEqual({ job: 'runtime-windows-x64', artifacts: true })
  })
})

describe('Git hooks', () => {
  it('leaves frozen Agent Note sidecars to the archive verifier', () => {
    const lefthook = loadWorkflow('lefthook.yml')

    for (const hookName of ['pre-commit', 'pre-merge-commit']) {
      const hook = lefthook[hookName]
      if (!isRecord(hook) || !Array.isArray(hook.jobs)) {
        throw new TypeError(`lefthook must define ${hookName} jobs`)
      }
      const pairing: unknown = hook.jobs.find(
        (job: unknown) => isRecord(job) && job.name === 'translation pairing (staged records)',
      )

      expect(pairing).toMatchObject({ exclude: ['.agents/notes/archived/**'] })
    }
  })
})

function loadWorkflow(path: string): Record<string, unknown> {
  const workflow: unknown = yaml.load(readFileSync(resolve(root, path), 'utf8'))
  if (!isRecord(workflow)) throw new TypeError(`${path} must define a workflow`)
  return workflow
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
