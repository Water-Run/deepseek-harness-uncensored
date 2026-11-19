/** Actual Electron download, checksum, Authenticode, and coordinator recovery; installer execution is forbidden. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { app } from 'electron'
import updaterModule from 'electron-updater'
import { DesktopUpdateCoordinator } from '../../lib/types/update-coordinator.js'
import { desktopUpdateJournalState } from '../../lib/types/update-journal.js'
import { DesktopUpdateHttpExecutor } from '../../lib/types/updates/electron-updater/http-executor.js'
import { resolveWindowsUpdatePublisher } from '../../scripts/windows-sign.mjs'
import { artifactDigest, createArtifactUpdateServer } from './artifact-update-server.mjs'
import { fixtureUpdateFeed } from './update-feed-adapter.mjs'

const root = process.env.DSH_SIGNED_UPDATE_TEST_ROOT
assert.ok(root, 'Launcher must supply a private test root')
app.setPath('userData', join(root, 'runtime', 'electron'))
const { NsisUpdater } = updaterModule
const report = { cases: [], installerExecuted: false, passed: false }

async function main() {
  await app.whenReady()
  const publisher = resolveWindowsUpdatePublisher(process.env.DSH_SIGNED_UPDATE_CERTIFICATE)
  const server = await createArtifactUpdateServer({
    signed: process.env.DSH_SIGNED_UPDATE_SIGNED,
    unsigned: process.env.DSH_SIGNED_UPDATE_UNSIGNED,
    ...(process.env.DSH_SIGNED_UPDATE_OLD ? {
      old: process.env.DSH_SIGNED_UPDATE_OLD,
      oldBlockmap: `${process.env.DSH_SIGNED_UPDATE_OLD}.blockmap`,
      signedBlockmap: `${process.env.DSH_SIGNED_UPDATE_SIGNED}.blockmap`,
    } : {}),
  })
  report.inputs = server.artifacts
  report.publisherName = publisher
  report.simulatedInstalledVersion = '1.0.0'
  report.syntheticFeedVersion = '1.0.1-nightly.1'
  const fixtures = []
  let installed = 0
  async function fixture(expectedPublisher = publisher, differential = false, multipleRanges = true) {
    const directory = join(root, 'runtime', `case-${fixtures.length}`)
    await mkdir(directory)
    const config = join(directory, 'app-update.yml')
    await writeFile(config, JSON.stringify({ publisherName: [expectedPublisher], updaterCacheDirName: 'cache' }))
    const forbidden = () => { throw new Error('Unexpected application quit or relaunch') }
    const updater = new NsisUpdater(undefined, {
      version: '1.0.0', name: 'signed-download-qualification', isPackaged: true,
      appUpdateConfigPath: config, userDataPath: directory, baseCachePath: directory,
      whenReady: async () => {}, quit: forbidden, relaunch: forbidden, onQuit: forbidden,
    })
    const logs = []
    const errors = []
    const states = []
    updater.logger = Object.fromEntries(['info', 'warn', 'error', 'debug'].map(level => [level, value => logs.push(String(value))]))
    updater.httpExecutor = new DesktopUpdateHttpExecutor(60_000)
    updater.disableDifferentialDownload = !differential
    updater.disableWebInstaller = true
    const readSource = fixtureUpdateFeed(updater, server.url, multipleRanges)
    updater.on('error', error => errors.push(error.code))
    updater.quitAndInstall = forbidden
    let authorized = false
    let waitForLaunch = async () => {}
    const handoffOrder = []
    const coordinator = new DesktopUpdateCoordinator(state => { states.push(state); return state },
      async () => authorized, updater, () => true, () => '1.0.0', undefined, 'nightly', undefined, readSource,
      () => () => { handoffOrder.push('quit ownership transferred') }, {
        async launch(file) {
          assert.equal(file, updater.installerPath)
          handoffOrder.push('launch requested')
          await waitForLaunch()
          installed++
          handoffOrder.push('launch acknowledged by fixture')
        },
        quit() { handoffOrder.push('quit requested') },
      })
    const f = { coordinator, updater, logs, errors, states, directory, handoffOrder,
      authorize: () => { authorized = true }, holdLaunch: handler => { waitForLaunch = handler } }
    fixtures.push(f)
    return f
  }
  const signatureChecks = f => f.logs.filter(line => line.startsWith('Verifying signature ')).length
  async function download(f) {
    const count = server.requests.length
    assert.equal((await f.coordinator.check(true)).phase, 'available')
    assert.equal(server.requests.length - count, 1, 'Checking must not download')
    assert.equal(server.requests.at(-1).path, '/nightly.yml')
    return f.coordinator.download('1.0.1-nightly.1')
  }
  async function rejected(f, code) {
    const state = await download(f)
    assert.equal(state.phase, 'error')
    assert.equal(state.failedOperation, 'download')
    assert.ok(f.errors.includes(code), `Expected updater rejection ${code}, received ${f.errors}`)
    assert.ok(!f.states.some(item => item.phase === 'ready'))
    await assert.rejects(f.coordinator.install('1.0.1-nightly.1'), /not ready/u)
    assert.deepEqual(f.handoffOrder, [])
    const cache = await readdir(join(f.directory, 'cache'), { recursive: true })
    assert.ok(!cache.some(file => file.endsWith('.exe')), 'Rejected executables must be removed from cache')
    const count = server.requests.length
    await f.coordinator.check()
    assert.equal(server.requests.length, count, 'Automatic checks must not retry rejected downloads')
    assert.equal(installed, 0)
  }
  try {
    server.select('signed')
    const wrong = await fixture('CN=Not the release publisher')
    await rejected(wrong, 'ERR_UPDATER_INVALID_SIGNATURE')
    report.cases.push('valid-hash-wrong-publisher-rejected-and-cleared')

    server.select('unsigned')
    const unsigned = await fixture()
    await rejected(unsigned, 'ERR_UPDATER_INVALID_SIGNATURE')
    report.cases.push('valid-hash-unsigned-rejected-and-cleared')

    server.select('signed', true)
    const corrupt = await fixture()
    await rejected(corrupt, 'ERR_CHECKSUM_MISMATCH')
    assert.ok(!corrupt.logs.some(line => line.startsWith('Verifying signature ')), 'Corrupt bytes must fail before signature verification')
    report.corruptDownloadJournal = desktopUpdateJournalState(corrupt.coordinator.state)
    assert.equal(report.corruptDownloadJournal.errorCode, 'ERR_CHECKSUM_MISMATCH')
    report.cases.push('corrupt-transfer-rejected-before-signature')

    server.select('signed')
    assert.equal((await download(unsigned)).phase, 'ready')
    assert.equal(await artifactDigest(unsigned.updater.installerPath), server.artifacts.signed.sha512)
    assert.ok(unsigned.states.some(state => state.phase === 'verifying'))
    assert.ok(unsigned.logs.some(line => line.startsWith('Verifying signature ')))
    const count = server.requests.length
    await unsigned.coordinator.check(true)
    await unsigned.coordinator.download('1.0.1-nightly.1')
    assert.equal(server.requests.length, count, 'Prepared targets must not download again')
    assert.equal(installed, 0)
    assert.equal((await unsigned.coordinator.install('1.0.1-nightly.1')).phase, 'ready')
    assert.equal(installed, 0)
    unsigned.authorize()
    const launchRequested = Promise.withResolvers()
    const launchAllowed = Promise.withResolvers()
    const checksBeforeInstall = signatureChecks(unsigned)
    unsigned.holdLaunch(() => { launchRequested.resolve(); return launchAllowed.promise })
    const installing = unsigned.coordinator.install('1.0.1-nightly.1')
    let installation
    try {
      await Promise.race([
        launchRequested.promise,
        installing.then(() => { throw new Error('Expected an installer launch request') }),
      ])
      assert.equal(signatureChecks(unsigned), checksBeforeInstall + 1)
      assert.deepEqual(unsigned.handoffOrder, ['launch requested'])
      assert.equal(installed, 0)
    } finally {
      launchAllowed.resolve()
      installation = await installing
    }
    assert.equal(installation.phase, 'installing')
    assert.deepEqual(unsigned.handoffOrder, [
      'launch requested', 'launch acknowledged by fixture', 'quit ownership transferred', 'quit requested',
    ])
    assert.equal(installed, 1, 'Installation handoff requires separate approval')
    report.verifiedHandoffOrder = unsigned.handoffOrder
    report.cases.push('explicit-retry-signed-ready-and-separate-install-handoff')
    if (server.artifacts.old) {
      report.differential = []
      for (const [name, multipleRanges, fault] of [
        ['multipart-range-reconstruction', true],
        ['single-range-reconstruction', false],
        ['missing-old-blockmap-full-fallback', true, 'missing-old-blockmap'],
        ['rejected-range-full-fallback', true, 'reject-ranges'],
      ]) {
        const f = await fixture(publisher, true, multipleRanges)
        await mkdir(join(f.directory, 'cache'))
        await copyFile(server.artifacts.old.file, join(f.directory, 'cache', 'installer.exe'))
        server.select('signed', false, fault)
        const start = server.requests.length
        const handoffsBeforeDownload = installed
        assert.equal((await download(f)).phase, 'ready')
        assert.equal(await artifactDigest(f.updater.installerPath), server.artifacts.signed.sha512)
        assert.ok(f.logs.some(line => line.startsWith('Verifying signature ')))
        assert.equal(installed, handoffsBeforeDownload, 'Download must not invoke another installer handoff')
        const requests = server.requests.slice(start)
        const payload = requests.filter(request => request.path.endsWith('.exe'))
        const fallback = f.logs.some(line => line.includes('fallback to full download'))
        assert.ok(requests.some(request => request.path.endsWith('1.0.0.exe.blockmap')))
        assert.ok(requests.some(request => request.path.endsWith('1.0.1-nightly.1.exe.blockmap')))
        if (!fault) {
          assert.equal(fallback, false, 'A full fallback cannot pass differential qualification')
          assert.ok(payload.length > 0 && payload.every(request => request.range))
          assert.equal(payload.some(request => request.range.includes(',')), multipleRanges)
          assert.ok(payload.reduce((bytes, request) => bytes + request.bytes, 0) < server.artifacts.signed.size,
            'Reconstruction must reuse bytes from the cached installer')
        }
        else {
          assert.equal(fallback, true)
          assert.equal(payload.filter(request => !request.range).length, 1)
          assert.equal(payload.at(-1).bytes, server.artifacts.signed.size)
          if (fault === 'reject-ranges') assert.ok(payload.some(request => request.range))
        }
        report.differential.push({ name, requests, fallback,
          payloadBytes: payload.reduce((bytes, request) => bytes + request.bytes, 0),
          fullSize: server.artifacts.signed.size })
        if (name === 'single-range-reconstruction') {
          const beforeInstall = signatureChecks(f)
          f.authorize()
          assert.equal((await f.coordinator.install('1.0.1-nightly.1')).phase, 'installing')
          assert.equal(signatureChecks(f), beforeInstall + 1)
          assert.deepEqual(f.handoffOrder, report.verifiedHandoffOrder)
          assert.equal(installed, handoffsBeforeDownload + 1)
          report.differentialHandoff = { name, order: f.handoffOrder }
        }
        report.cases.push(name)
      }
    }
    for (const [name, expectedPublisher, failure, verifierUnavailable] of [
      ['cached-signed-installer-rechecked-before-handoff', publisher, undefined],
      ['cached-installer-with-wrong-publisher-refuses-handoff', 'CN=Other,O=Other,C=US', /does not match the configured publisher/u],
      ['cached-installer-refuses-handoff-when-signature-check-is-unavailable', publisher, /signature inspection could not complete/u, true],
    ]) {
      const f = await fixture(expectedPublisher)
      const pending = join(f.directory, 'cache', 'pending')
      await mkdir(pending, { recursive: true })
      const cachedFile = basename(unsigned.updater.installerPath)
      await copyFile(unsigned.updater.installerPath, join(pending, cachedFile))
      await copyFile(join(dirname(unsigned.updater.installerPath), 'update-info.json'), join(pending, 'update-info.json'))
      server.select('signed')
      const before = server.requests.length
      assert.equal((await download(f)).phase, 'ready')
      assert.equal(server.requests.length - before, 1, 'Only the feed is fetched for a pending cache hit')
      const handoffs = installed
      f.authorize()
      const systemRoot = process.env.SystemRoot
      assert.ok(systemRoot)
      if (verifierUnavailable) process.env.SystemRoot = join(f.directory, 'absent-system-directory')
      const state = await f.coordinator.install('1.0.1-nightly.1').finally(() => { process.env.SystemRoot = systemRoot })
      assert.ok(f.logs.some(line => line.startsWith('Verifying signature ')))
      if (failure === undefined) {
        assert.equal(state.phase, 'installing')
        assert.equal(installed, handoffs + 1)
      } else {
        assert.equal(state.preparationFailure, 'installer-integrity')
        assert.match(state.technicalDetails, failure)
        assert.equal(f.updater.installerPath, null)
        assert.equal(installed, handoffs)
        assert.deepEqual(f.handoffOrder, [])
        assert.deepEqual(await readdir(pending), [cachedFile])
        const retryStart = server.requests.length
        const retry = await f.coordinator.download('1.0.1-nightly.1')
        assert.deepEqual(server.requests.slice(retryStart).map(request => request.path), ['/nightly.yml', '/payload-1.0.1-nightly.1.exe'])
        if (verifierUnavailable) assert.equal(retry.phase, 'ready')
        else assert.equal(retry.failedOperation, 'download')
        assert.equal(installed, handoffs)
      }
      report.cases.push(name)
    }
    assert.ok(fixtures.every(f => !f.logs.some(line => line.includes('Ignoring signature validation'))))
    assert.deepEqual(server.failures, [])
    for (const artifact of Object.values(server.artifacts)) assert.equal(await artifactDigest(artifact.file), artifact.sha512)
    report.passed = true
  }
  finally {
    for (const f of fixtures) f.coordinator.dispose()
    await server.close()
    report.requests = server.requests
    report.fixtures = fixtures.map(f => ({ errors: f.errors, phases: f.states.map(state => state.phase) }))
    await writeFile(join(root, 'result.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
}

main().then(() => app.exit(0), async (error) => {
  console.error(error)
  await writeFile(join(root, 'failure.txt'), `${error.stack ?? error}\n`)
  app.exit(1)
})
