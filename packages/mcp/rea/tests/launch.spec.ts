import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Config } from '../src/index.ts'
import { bundledReaEntry, resolveReaLaunch } from '../src/launch.ts'
import type { ReaOptions } from '../src/types.ts'

afterEach(() => { vi.unstubAllEnvs() })

const options: ReaOptions = { enabled: true, nodePath: '', cliPath: '', ghidraPath: '', javaHome: '', idaConfig: '',
  provider: 'auto', startupTimeoutMs: 60000, toolTimeoutMs: 180000, catalogPageSize: 20 }

it('uses bundled paths without writing them into saved preferences', () => {
  expect(Config({}).enabled.get()).toBe(true)
  expect(Config({ enabled: false }).enabled.get()).toBe(false)
  const launch = resolveReaLaunch(options, { nodePath: '/runtime/node', cliPath: () => '/bundle/rea.mjs' })
  expect(launch).toMatchObject({ nodePath: '/runtime/node', cliPath: '/bundle/rea.mjs' })
  expect(options).toMatchObject({ nodePath: '', cliPath: '' })
})

it('retains independent owner overrides and resolves only missing paths', () => {
  const cliPath = vi.fn(() => '/bundle/rea.mjs')
  expect(resolveReaLaunch({ ...options, nodePath: ' /custom/node ', cliPath: ' /custom/rea.mjs ' },
    { nodePath: '/runtime/node', cliPath })).toMatchObject({ nodePath: '/custom/node', cliPath: '/custom/rea.mjs' })
  expect(cliPath).not.toHaveBeenCalled()
  expect(resolveReaLaunch({ ...options, nodePath: '/custom/node' }, { nodePath: '/runtime/node', cliPath }).cliPath).toBe('/bundle/rea.mjs')
})

it('resolves the installed npm package with an application-owned Node executable', () => {
  vi.stubEnv('DSH_REA_NODE_PATH', '/carrier/node')
  const launch = resolveReaLaunch(options)
  expect(launch.nodePath).toBe('/carrier/node')
  expect(launch.cliPath).toContain(join('rea-agents', 'scripts', 'rea.mjs'))
  vi.stubEnv('DSH_REA_NODE_PATH', '')
  expect(resolveReaLaunch(options).nodePath).toBe(process.execPath)
})

it('maps only Electron app.asar paths to the unpacked package tree', () => {
  expect(bundledReaEntry(join('/resources', 'app.asar', 'dsh', 'node_modules', 'rea-agents', 'package.json')))
    .toBe(join('/resources', 'app.asar.unpacked', 'dsh', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'))
  expect(bundledReaEntry(join('/source', 'node_modules', 'rea-agents', 'package.json')))
    .toBe(join('/source', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'))
})
