import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import yaml from 'js-yaml'
import { pnpmCommand } from '../../../scripts/release/process.ts'
import { COVERAGE_TEST_TIMEOUT_ENV, coverageTestTimeoutOptions } from '../../../scripts/coverage-partitions.ts'
import { prepareRuntimeLockfile, verifyRuntimeLockfile } from '../scripts/prepare-runtime-lockfile.ts'

// Two resolutions and a frozen install pay separate subprocess startup costs under CI load.
const timeout = Math.max(60_000, coverageTestTimeoutOptions(process.env[COVERAGE_TEST_TIMEOUT_ENV]).testTimeout ?? 0)

it('keeps the source resolution when a registry offers a newer matching release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-runtime-lock-install-'))
  const execute = promisify(execFile)
  const library = 'runtime-lock-fixture'
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([name]) => /^(?:path|systemroot|windir|comspec|temp|tmp)$/iu.test(name)))
  const npmrc = join(root, 'npmrc')
  await writeFile(npmrc, '')
  const archives = new Map<string, Buffer>()
  const requests: string[] = []
  const server = createServer((req, res) => {
    const path = req.url ?? ''
    requests.push(path)
    if (req.headers.authorization !== undefined) { res.writeHead(403); res.end(); return }
    const archive = archives.get(path)
    if (archive !== undefined) { res.end(archive); return }
    if (path !== `/${library}`) { res.writeHead(404); res.end(); return }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ name: library, 'dist-tags': { latest: '1.1.0' }, versions: Object.fromEntries(['1.0.0', '1.1.0'].map((version) => {
      const bytes = archives.get(`/${version}.tgz`)
      assert(bytes)
      return [version, { name: library, version, dist: { tarball: `${registry}${version}.tgz`, integrity: hash(bytes) } }]
    })) }))
  })
  const hash = (bytes: Buffer): string => `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  let registry = ''
  try {
    const pack = async (name: string, version: string, dependencies = {}): Promise<Buffer> => {
      const directory = join(root, `${name}-${version}`)
      await mkdir(join(directory, 'package'), { recursive: true })
      await writeFile(join(directory, 'package/package.json'), JSON.stringify({ name, version, dependencies }))
      await execute('tar', ['-czf', join(directory, 'archive.tgz'), '-C', directory, 'package'], { env, windowsHide: true, timeout: 15000 })
      return readFile(join(directory, 'archive.tgz'))
    }
    for (const version of ['1.0.0', '1.1.0']) archives.set(`/${version}.tgz`, await pack(library, version))
    const core = await pack('core', '1.0.0', { [library]: '^1.0.0' })
    const packageSet = { schemaVersion: 1 as const, packages: [{ name: 'core', version: '1.0.0', file: 'core.tgz', bytes: core.length, integrity: hash(core) }] }
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert(address && typeof address === 'object')
    registry = `http://127.0.0.1:${address.port}/`
    const source = join(root, 'source')
    await mkdir(source)
    const original = archives.get('/1.0.0.tgz')
    assert(original)
    await writeFile(join(source, 'pnpm-lock.yaml'), yaml.dump({
      lockfileVersion: '9.0', settings: { autoInstallPeers: false, excludeLinksFromLockfile: false },
      importers: { '.': { dependencies: { [library]: { specifier: '^1.0.0', version: '1.0.0' } } } },
      packages: { [`${library}@1.0.0`]: { resolution: { integrity: hash(original), tarball: `${registry}1.0.0.tgz` } } },
      snapshots: { [`${library}@1.0.0`]: {} },
    }))
    const sourceBytes = await readFile(join(source, 'pnpm-lock.yaml'))
    const [command, ...prefix] = pnpmCommand()
    const install = async (project: string, args: string[]): Promise<void> => {
      await execute(command, [...prefix, 'install', ...args,
        `--config.registry=${registry}`, `--config.userconfig=${npmrc}`, `--config.store-dir=${join(root, 'store')}`,
        '--config.manage-package-manager-versions=false', '--config.enable-global-virtual-store=false',
      ], { cwd: project, env: { ...env, CI: 'true', XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state') }, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
    }
    const project = async (name: string): Promise<string> => {
      const path = join(root, name)
      await mkdir(join(path, 'desktop-packages'), { recursive: true })
      await writeFile(join(path, 'desktop-packages/core.tgz'), core)
      await writeFile(join(path, 'package.json'), JSON.stringify({ private: true, dependencies: { core: 'file:./desktop-packages/core.tgz' } }))
      await writeFile(join(path, 'pnpm-workspace.yaml'), yaml.dump({ packages: ['.'], nodeLinker: 'hoisted', autoInstallPeers: false, overrides: { core: 'file:./desktop-packages/core.tgz' } }))
      return path
    }
    const fresh = await project('fresh')
    await install(fresh, ['--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'])
    const freshLock = await readFile(join(fresh, 'pnpm-lock.yaml'), 'utf8')
    expect(freshLock).toContain(`${library}@1.1.0`)
    expect(requests).toContain(`/${library}`)
    const seeded = await project('seeded')
    const plan = prepareRuntimeLockfile(seeded, source, packageSet, { platform: process.platform, arch: process.arch })
    await writeFile(join(seeded, 'pnpm-lock.yaml'), freshLock)
    expect(() => { verifyRuntimeLockfile(seeded, plan) }).toThrow('unreviewed registry resolution')
    prepareRuntimeLockfile(seeded, source, packageSet, { platform: process.platform, arch: process.arch })
    await install(seeded, ['--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'])
    verifyRuntimeLockfile(seeded, plan)
    const seededLock = await readFile(join(seeded, 'pnpm-lock.yaml'), 'utf8')
    expect(seededLock).toContain(`${library}@1.0.0`)
    expect(seededLock).not.toContain(`${library}@1.1.0`)
    await install(seeded, ['--prod', '--frozen-lockfile', '--trust-lockfile', '--ignore-scripts'])
    const installed: unknown = JSON.parse(await readFile(join(seeded, 'node_modules', library, 'package.json'), 'utf8'))
    expect(installed).toMatchObject({ name: library, version: '1.0.0' })
    expect(await readFile(join(source, 'pnpm-lock.yaml'))).toEqual(sourceBytes)
    expect(requests).not.toContain('/1.1.0.tgz')
  } finally {
    server.closeAllConnections()
    if (server.listening) await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
}, timeout)
