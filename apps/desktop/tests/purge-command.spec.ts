/** Legacy upstream publishing is not an entry point for the independent fork. @module */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { z } from 'zod'

const root = fileURLToPath(new URL('../../..', import.meta.url))

it('omits upstream upload aliases and the storage SDK', async () => {
  const schema = z.object({ scripts: z.record(z.string(), z.string()) })
  for (const path of ['package.json', 'apps/desktop/package.json']) {
    const manifest = schema.parse(JSON.parse(await readFile(join(root, path), 'utf8')))
    expect(Object.keys(manifest.scripts).filter(name => name.startsWith('upload:') || name === 'purge:latest')).toEqual([])
  }
  const desktop = z.object({ devDependencies: z.record(z.string(), z.string()) })
    .parse(JSON.parse(await readFile(join(root, 'apps/desktop/package.json'), 'utf8')))
  expect(desktop.devDependencies).not.toHaveProperty('cos-nodejs-sdk-v5')
})

const retired = ['upload-target.ts', 'publish-desktop-ci.ts', 'rollback-desktop-channel.ts', 'publish-installed-update.ts',
  'retain-desktop-ci.ts', 'resolve-desktop-publish-ci.ts', 'resolve-retained-desktop-publish-ci.ts',
  'archive-desktop-ci.ts', 'publish-desktop-rollout-ci.ts', 'publish-website-ci.ts',
  'preflight-desktop-publish.mjs', 'preflight-desktop-publish-local.mjs']

it.each(retired)('refuses %s before parsing arguments or consulting deployment credentials', async (entry) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^DSH_|^DOWNLOAD_|^PACKAGE_/iu.test(name)))
  const outcome = await new Promise<{ code: string | number | null | undefined; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [...entry.endsWith('.ts') ? ['--import', import.meta.resolve('tsx/esm')] : [],
      join(root, 'apps/desktop/scripts', entry), '--publish', '--execute', 'fixture-secret-not-for-output'],
    { cwd: root, env: { ...env, DOWNLOAD_PROD_COS_SECRET_KEY: 'fixture-secret-not-for-output',
      DSH_PACKAGING_CONFIG_DIR: join(root, '.missing-retired-publication-config') },
    timeout: 20_000, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ code: error?.code, stdout, stderr })
    })
  })
  expect(outcome.code).toBe(1)
  expect(outcome.stdout).toBe('')
  expect(outcome.stderr).toContain('DSHU does not use the upstream COS uploader.')
  expect(outcome.stderr).toContain('Water-Run/deepseek-harness-uncensored')
  expect(outcome.stderr).not.toContain('DOWNLOAD_')
  expect(outcome.stderr).not.toContain('fixture-secret-not-for-output')
})

it.skipIf(process.platform !== 'win32')('refuses the retired PowerShell credential launcher without decrypting a credential', async () => {
  const outcome = await new Promise<{ code: string | number | null | undefined; stdout: string; stderr: string }>((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      join(root, 'apps/desktop/scripts/upload-with-credentials.ps1'), '-CredentialFile', 'fixture-secret-not-for-output'],
    { cwd: root, timeout: 20_000, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ code: error?.code, stdout, stderr })
    })
  })
  expect(outcome.code).toBe(1)
  expect(outcome.stdout).toBe('')
  expect(outcome.stderr).toContain('DSHU upstream publishing is retired.')
  expect(outcome.stderr).not.toContain('fixture-secret-not-for-output')
})
