import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveWindowsUpdatePublisher } from '../scripts/windows-sign.mjs'
import { verifyWindowsUpdatePublisher } from '../src/updates/electron-updater/windows-publisher.ts'

const inspectSignature = vi.hoisted(() => vi.fn<() => Promise<{ stdout: string; stderr: string }>>())

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: inspectSignature }),
}))

vi.mock('../scripts/windows-sign.mjs', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/windows-sign.mjs')>(),
  installWindowsNsisBootstrapSigner: vi.fn(),
}))

vi.mock('node:crypto', async importOriginal => ({
  ...await importOriginal<typeof import('node:crypto')>(),
  X509Certificate: class {
    readonly ca = false
    readonly keyUsage = ['1.3.6.1.5.5.7.3.3']
    constructor(private readonly contents: Buffer) {}
    toLegacyObject(): { subject: unknown } {
      return { subject: JSON.parse(this.contents.toString('utf8')) as unknown }
    }
  },
}))

const require = createRequire(import.meta.url)
// Exercise the installed builder's metadata derivation without acquiring a signing device.
const { WindowsSignToolManager } = require('app-builder-lib/out/codeSign/windowsSignToolManager.js') as {
  WindowsSignToolManager: new (packager: {
    platformSpecificBuildOptions: unknown
    getCscLink: () => undefined
  }) => { computedPublisherName: { value: Promise<string[] | null> } }
}
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'))
const { parseDn } = builderRequire('builder-util-runtime') as { parseDn: (value: string) => Map<string, string> }

async function withCertificate(subject: unknown, action: (file: string, signTool: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-update-publisher-'))
  try {
    const certificate = join(directory, 'publisher.cer')
    const signTool = join(directory, 'signtool.exe')
    await writeFile(certificate, JSON.stringify(subject))
    await writeFile(signTool, 'inert signing-tool fixture')
    await action(certificate, signTool)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('Windows update publisher', () => {
  beforeAll(() => {
    vi.stubEnv('SystemRoot', join(tmpdir(), 'windows-signature-inspection'))
    vi.stubEnv('DSH_DESKTOP_APP_ID', 'com.example.publisher-test')
    vi.stubEnv('DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN', 'https://policy.example.com')
    vi.stubEnv('DSH_DESKTOP_MANDATORY_UPDATE_CONFIG', JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }))
    vi.stubEnv('DSH_DESKTOP_TARGET_PLATFORM', 'win32')
    vi.stubEnv('DSH_DESKTOP_UNSIGNED', '1')
  })
  afterAll(() => vi.unstubAllEnvs())

  it.each([
    { signatureType: 'Authenticode', timestamped: true, diagnostic: null },
    { signatureType: 'Catalog', timestamped: true, diagnostic: 'Installer must carry an embedded Authenticode signature' },
    { signatureType: 'Authenticode', timestamped: false, diagnostic: 'Installer has no verified signing timestamp' },
    { signatureType: undefined, timestamped: true, diagnostic: 'Invalid Windows signature inspection response' },
  ])('evaluates the Windows verification record (%j)', async ({ signatureType, timestamped, diagnostic }) => {
    const subject = { CN: 'Publisher', O: 'Company', C: 'CN' }
    const certificate = Buffer.from(JSON.stringify(subject)).toString('base64')
    inspectSignature.mockResolvedValueOnce({
      stdout: JSON.stringify({ status: 'Valid', signatureType, timestamped, certificate }), stderr: '',
    })
    await expect(verifyWindowsUpdatePublisher(['CN=Publisher,O=Company,C=CN'], join(tmpdir(), 'installer.exe')))
      .resolves.toBe(diagnostic)
  })

  it('preserves organization identity and escapes DN delimiters using the updater parser', async () => {
    const subject = { CN: '测试 "Publisher", Inc;+\\', O: ' Leading=org ', C: 'CN', ST: 'State' }
    await withCertificate(subject, async (file) => {
      expect(Object.fromEntries(parseDn(resolveWindowsUpdatePublisher(file))))
        .toEqual({ CN: subject.CN, O: subject.O, C: subject.C })
    })
  })

  it.each([
    { CN: '', O: 'Company', C: 'CN' },
    { CN: 'Publisher', C: 'CN' },
    { CN: 'Publisher', O: 'Company', C: ['CN', 'US'] },
  ])('rejects missing or ambiguous publisher identity: %j', async (subject) => {
    await withCertificate(subject, async (file) => {
      expect(() => resolveWindowsUpdatePublisher(file)).toThrow(/requires one nonempty/u)
    })
  })

  it.each([true, false])('supplies publisher metadata with explicit Windows target = %s', async (explicitTarget) => {
    const { createElectronBuilderConfig } = await import('../electron-builder.config.mjs')
    await withCertificate({ CN: 'Publisher', O: 'Company', C: 'CN' }, async (file, signTool) => {
      const config = createElectronBuilderConfig({
        DSH_DESKTOP_APP_ID: 'com.example.publisher-test',
        DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
        DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://policy.example.com',
        ...(explicitTarget ? { DSH_DESKTOP_TARGET_PLATFORM: 'win32' } : {}),
        DSH_DESKTOP_WINDOWS_CER_FILE: file,
        DSH_DESKTOP_WINDOWS_SIGNTOOL: signTool,
        DSH_DESKTOP_WINDOWS_KEY_CONTAINER: 'test-container',
        DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'test-pin',
        DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
      }, 'win32', 'x64')
      expect(config.win.forceCodeSigning).toBe(true)
      expect(config.artifactName).toMatch(/^deepseek-harness-uncensored-\d{4}\.\d{2}\.\d{2}\.[1-9]\d*-\$\{os\}-\$\{arch\}\.\$\{ext\}$/u)
      expect(typeof config.win.signtoolOptions.sign).toBe('function')
      const manager = new WindowsSignToolManager({ platformSpecificBuildOptions: config.win, getCscLink: () => undefined })
      expect(await manager.computedPublisherName.value).toEqual(['CN=Publisher,O=Company,C=CN'])
    })
  })
})
