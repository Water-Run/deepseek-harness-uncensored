/** Real Electron fixture for account-scoped Platform storage across process restarts. */
import { app, BrowserWindow, session } from 'electron'
import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OBSERVE = `(() => {
  const button = document.querySelector('button')
  return button === null ? 'hidden' : 'visible'
})()`

const bounds = { x: 0, y: 0, width: 800, height: 600 }
const legacyPreference = 'legacy-platform-preference'

function firstAccountPartition(origin) {
  const digest = createHash('sha256').update(JSON.stringify([origin, 'first'])).digest('hex')
  return `dsh-platform-${digest}`
}

async function publish(states) {
  const lines = `PLATFORM_STORAGE_RESULT ${JSON.stringify(states)}\n`
  await new Promise((resolve, reject) => process.stdout.write(lines, error => error ? reject(error) : resolve()))
}

async function seedLegacyAccount(origin) {
  const storage = session.fromPartition(`persist:${firstAccountPartition(origin)}`)
  const window = new BrowserWindow({ show: false, webPreferences: { session: storage, sandbox: true } })
  try {
    await window.loadURL(origin)
    await window.webContents.executeJavaScript(`localStorage.setItem(${JSON.stringify(legacyPreference)}, 'retained')`)
    await storage.cookies.set({ url: origin, name: 'legacy-auth', value: 'secret', expirationDate: Date.now() / 1000 + 3600 })
    storage.flushStorageData()
    await storage.cookies.flushStore()
    await publish([])
  } finally {
    window.destroy()
  }
  app.quit()
}

/**
 * Read the notice state from the embedded document.
 * @param contents - embedded Platform page.
 * @returns `visible` while the dismissal control is rendered, otherwise `hidden`.
 */
async function observe(contents) {
  const value = await contents.executeJavaScript(OBSERVE, true)
  if (value !== 'visible' && value !== 'hidden') throw new Error(`unexpected notice state ${String(value)}`)
  return value
}

/**
 * @param owner - application window containing the embedded view.
 * @returns the current embedded Platform view.
 */
function platformView(owner) {
  const view = owner.contentView.children.find(child => typeof child.webContents?.executeJavaScript === 'function')
  if (view === undefined) throw new Error('embedded Platform view is missing')
  return view
}

/**
 * Click the notice's dismissal control and wait, bounded, until the notice leaves the DOM.
 * @param contents - embedded Platform page.
 */
async function dismissNotice(contents) {
  const clicked = await contents.executeJavaScript(
    `(() => { const button = document.querySelector('button'); if (button === null) return false; button.click(); return true })()`,
    true)
  if (clicked !== true) throw new Error('notice dismissal control is missing')
  if (await observe(contents) !== 'hidden') throw new Error('notice stayed visible after dismissal')
}

/** Read partition storage before any subsequent Platform opening can clear it. */
async function assertClosedStorage(browserSession, origin) {
  const probe = new BrowserWindow({ show: false, webPreferences: { session: browserSession, sandbox: true } })
  try {
    await probe.loadURL(origin)
    const stores = await probe.webContents.executeJavaScript(`(async () => ({
      cookie: document.cookie,
      cacheNames: await caches.keys(),
      databaseNames: (await indexedDB.databases()).map(database => database.name),
    }))()`)
    if (stores.cookie !== '' || stores.cacheNames.length !== 0 || stores.databaseNames.length !== 0) {
      throw new Error('authentication storage survived Platform close')
    }
    if (await observe(probe.webContents) !== 'hidden') throw new Error('Platform preference was removed on close')
  } finally {
    probe.destroy()
  }
}

/**
 * Exercise the built Platform view in an isolated Electron profile.
 * @param viewModule - Absolute path to the built Platform view.
 * @param origin - Fixture loopback origin.
 * @param phase - Legacy seed, first run, or restart of the same profile.
 */
export async function runPlatformStorage(viewModule, origin, phase) {
  if (phase !== 'legacy' && phase !== 'first' && phase !== 'restart') throw new Error(`unknown phase ${phase}`)
  const base = new URL(origin).origin
  await app.whenReady()
  if (phase === 'legacy') return seedLegacyAccount(base)
  const { DesktopPlatformView } = await import(pathToFileURL(viewModule).href)
  const owner = new BrowserWindow({ show: false, width: 900, height: 700 })
  const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url))
  const manager = new DesktopPlatformView(preload, () => 'en_US', process.platform === 'win32' ? 'win32' : 'darwin', () => false)
  const account = userId => ({ origin: base, token: 'fixture-secret', userId })
  const states = []
  const record = async name => {
    states.push(`${name}=${await observe(platformView(owner).webContents)}`)
  }

  manager.setSession(account('first'))
  await manager.open(owner, 'usage', bounds)
  await record(phase === 'first' ? 'first-open' : 'restart-first-open')
  if (process.platform === 'win32' && phase === 'first') {
    const contents = platformView(owner).webContents
    const oldPath = join(app.getPath('sessionData'), 'Partitions', firstAccountPartition(base))
    const original = await stat(oldPath, { bigint: true })
    const current = await stat(contents.session.storagePath, { bigint: true })
    if (original.dev !== current.dev || original.ino !== current.ino) throw new Error('Platform browser profile moved')
    const preference = await contents.executeJavaScript(`localStorage.getItem(${JSON.stringify(legacyPreference)})`)
    if (preference !== 'retained') throw new Error('Platform legacy preference was lost')
    if (await contents.executeJavaScript('document.cookie') !== '') throw new Error('Platform legacy authentication survived opening')
  }
  if (phase === 'restart') {
    const cookies = await platformView(owner).webContents.executeJavaScript('document.cookie')
    if (cookies !== '') throw new Error('previous-process authentication survived startup')
  }
  if (phase === 'first') {
    await dismissNotice(platformView(owner).webContents)
    await record('first-got-it')
    const contents = platformView(owner).webContents
    const cookie = await contents.executeJavaScript("document.cookie = 'fixture-auth=secret; SameSite=Lax'; document.cookie")
    if (cookie !== 'fixture-auth=secret') throw new Error('authentication cookie did not seed')
    await contents.executeJavaScript("window.addEventListener('beforeunload', event => { event.preventDefault(); event.returnValue = false })")
    const cache = await contents.executeJavaScript(`(async () => {
      let stage = 'open'
      try {
        const store = await caches.open('fixture-auth')
        const request = new URL('/secret', location.href)
        stage = 'put'
        await store.put(request, new Response(null, { status: 204, headers: { 'X-Fixture-Auth': 'secret' } }))
        stage = 'read'
        return { marker: (await store.match(request))?.headers.get('X-Fixture-Auth') }
      } catch (error) {
        return { error: stage + ': ' + error.name + ': ' + error.message }
      }
    })()`)
    if (cache?.marker !== 'secret') throw new Error(`authentication cache did not seed: ${JSON.stringify(cache)}`)
    await contents.executeJavaScript(`new Promise((resolve, reject) => {
      const request = indexedDB.open('fixture-auth')
      request.onsuccess = () => { request.result.close(); resolve() }
      request.onerror = () => reject(request.error)
    })`)
    const storage = contents.session
    await manager.closeAndWait()
    await assertClosedStorage(storage, base)
    states.push('close-storage=cleared')
    await manager.open(owner, 'usage', bounds)
    await record('first-reopen')
    manager.setSession(account('second'))
    await manager.open(owner, 'usage', bounds)
    await record('second-account')
    manager.setSession(account('first'))
    await manager.open(owner, 'usage', bounds)
    await record('back-to-first')
    manager.setSession(null)
    manager.setSession({ ...account('first'), token: 'new-grant' })
    await manager.open(owner, 'usage', bounds)
    await record('signed-in-again')
  }
  const persistedSession = platformView(owner).webContents.session
  manager.setSession(account(null))
  await manager.open(owner, 'usage', bounds)
  if (await observe(platformView(owner).webContents) !== 'visible') throw new Error('temporary session inherited preferences')
  await dismissNotice(platformView(owner).webContents)
  manager.close()
  await manager.open(owner, 'usage', bounds)
  if (await observe(platformView(owner).webContents) !== 'visible') throw new Error('temporary session retained preferences')
  await manager.dispose()
  if (phase === 'first') {
    // Seed residue left by an interrupted process after normal cleanup has completed.
    await persistedSession.cookies.set({ url: base, name: 'crash-auth', value: 'secret', expirationDate: Date.now() / 1000 + 3600 })
    await persistedSession.cookies.flushStore()
  }

  await publish(states)
  owner.destroy()
  app.quit()
}
