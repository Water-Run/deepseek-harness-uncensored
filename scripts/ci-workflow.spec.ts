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

  it('verifies the archive against the pinned digest', () => {
    const script = readFileSync(resolve(root, 'scripts/prepare-ci-bubblewrap.sh'), 'utf8')

    expect(script).toMatch(/^readonly BUBBLEWRAP_SHA256='[0-9a-f]{64}'$/mu)
    expect(script).toContain('acquire_verified_archive "$BUBBLEWRAP_URL" "$BUBBLEWRAP_SHA256" "$archive"')
  })

  // Ephemeral runners share a `~` layout: GitHub-hosted runners and Blacksmith
  // (whose runners register as self-hosted but keep /home/runner as HOME). The
  // in-house `vm-backup` pool keeps `~/.cache` on a different, persistent
  // layout, so lanes that can select it must not restore or save this cache.
  // `ci-master.yml` prepares bubblewrap only on lanes that can select the
  // persistent runners, and the manual benchmark matrix includes their 64/96-core
  // rows, so neither carries cache steps.
  const hostedOnly = "vars.DSH_CI_FAILOVER_LINUX != 'selfhosted' || github.event.pull_request.user.login == 'dependabot[bot]'"
  const cachedJobs = new Map<string, string | undefined>([
    ['ci.yml:node-24-coverage', hostedOnly],
    ['ci.yml:node-24-consumers', hostedOnly],
    ['ci.yml:node-compat', hostedOnly],
    ['e2e.yml:e2e', undefined],
  ])

  it.each(['ci.yml', 'ci-master.yml', 'e2e.yml'])(
    '%s caches the verified archive only on the lanes that run on ephemeral runners',
    (name) => {
      const script = readFileSync(resolve(root, 'scripts/prepare-ci-bubblewrap.sh'), 'utf8')
      expect(script).toContain('readonly BUBBLEWRAP_CACHE_DIR="${HOME}/.cache/dsh-ci/bubblewrap"')
      const cache = {
        path: '~/.cache/dsh-ci/bubblewrap',
        key: "bubblewrap-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('scripts/prepare-ci-bubblewrap.sh') }}",
      }
      const workflow = loadWorkflow('.github/workflows/' + name)
      if (!isRecord(workflow.jobs)) throw new TypeError(`${name} must define jobs`)

      let preparations = 0
      for (const [jobName, job] of Object.entries(workflow.jobs)) {
        if (!isRecord(job) || !Array.isArray(job.steps)) continue
        const steps = job.steps.filter(isRecord)
        const preparation = steps.findIndex(step =>
          typeof step.run === 'string' && step.run.includes('bash scripts/prepare-ci-bubblewrap.sh'))
        if (preparation < 0) continue
        preparations += 1
        const key = `${name}:${jobName}`
        if (!cachedJobs.has(key)) {
          expect(
            steps.filter(step => typeof step.uses === 'string' && step.uses.startsWith('actions/cache/')),
            key,
          ).toEqual([])
          continue
        }
        const guard = cachedJobs.get(key)
        const cacheHit = "steps.bubblewrap-cache.outputs.cache-hit != 'true'"
        expect(steps[preparation - 1]).toEqual({
          name: 'Restore verified bubblewrap archive',
          id: 'bubblewrap-cache',
          ...(guard === undefined ? {} : { if: guard }),
          uses: 'actions/cache/restore@v6.1.0',
          with: cache,
        })
        expect(steps[preparation + 1]).toEqual({
          name: 'Save verified bubblewrap archive',
          if: guard === undefined ? cacheHit : `(${guard}) && ${cacheHit}`,
          uses: 'actions/cache/save@v6.1.0',
          with: cache,
        })
      }
      expect(preparations).toBeGreaterThan(0)
    },
  )
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
