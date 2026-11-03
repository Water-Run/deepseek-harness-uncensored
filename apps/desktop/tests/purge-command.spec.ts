/** Legacy upstream publishing is not an entry point for the independent fork. @module */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { z } from 'zod'

const root = fileURLToPath(new URL('../../..', import.meta.url))

it('omits upstream upload aliases and refuses the legacy CLI before consulting deployment credentials', async () => {
  const schema = z.object({ scripts: z.record(z.string(), z.string()) })
  for (const path of ['package.json', 'apps/desktop/package.json']) {
    const manifest = schema.parse(JSON.parse(await readFile(join(root, path), 'utf8')))
    expect(Object.keys(manifest.scripts).filter(name => name.startsWith('upload:') || name === 'purge:latest')).toEqual([])
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^DSH_|^DOWNLOAD_|^PACKAGE_/iu.test(name)))
  const outcome = await new Promise<{ code: string | number | null | undefined; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, ['--import', import.meta.resolve('tsx/esm'),
      join(root, 'apps/desktop/scripts/upload-target.ts'), 'win-x64'],
    { cwd: root, env, timeout: 20_000, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ code: error?.code, stdout, stderr })
    })
  })
  expect(outcome.code).toBe(1)
  expect(outcome.stdout).toBe('')
  expect(outcome.stderr).toContain('DSHU does not use the upstream COS uploader.')
  expect(outcome.stderr).toContain('Water-Run/deepseek-harness-uncensored')
  expect(outcome.stderr).not.toContain('DOWNLOAD_')
})
