/** Native Electron integration fixture; the parent owns the Web Host and all network targets. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, session } from 'electron'
import { DesktopBrowserGuests } from '../../lib/types/browser-guests.js'
import { readBrowserProxyCertificate } from '../../lib/types/browser-trust.js'
import { DESKTOP_IPC } from '../../lib/types/ipc.js'
import { forwardWebRequest } from '../../lib/types/web-document.js'

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'))
assert.equal(app.isReady(), false, 'Set the private profile before Electron initializes')
app.setPath('userData', input.userData)
app.setPath('sessionData', input.userData)
app.commandLine.appendSwitch('disable-background-networking')
let stage = 'app readiness'
const timer = setTimeout(() => { console.error('Native browser fixture timed out: ' + stage); app.exit(2) }, 45_000)
let window
void app.whenReady().then(async () => {
  stage = 'owner window'
  window = new BrowserWindow({ show: false, skipTaskbar: true, webPreferences: {
    nodeIntegration: false, contextIsolation: true, sandbox: false, webviewTag: true, backgroundThrottling: false,
    preload: fileURLToPath(new URL('./sidebar-browser-proxy-preload.mjs', import.meta.url)),
  } })
  const guests = new DesktopBrowserGuests(() => input.control, proxy => input.trust === undefined
    ? Promise.resolve(null)
    : readBrowserProxyCertificate(proxy, request => forwardWebRequest(request, input.trust.host, input.trust.cookie)))
  const native = new Map()
  guests.bind(window, (guest, lease) => { native.set(lease, guest); return () => { native.delete(lease) } })
  ipcMain.handle(DESKTOP_IPC.browserAcquire, async (event, workspace, proxy) => {
    stage = proxy === undefined ? 'ordinary reservation' : 'Security reservation'
    assert.equal(event.sender, window.webContents)
    const reservation = await guests.acquire(event.sender, workspace, proxy)
    // Keep this fixture independent of the machine's ordinary system proxy.
    if (proxy === undefined) await session.fromPartition(reservation.partition).setProxy({ mode: 'direct' })
    stage = proxy === undefined ? 'ordinary guest attachment' : 'Security guest attachment'
    return reservation
  })
  ipcMain.handle(DESKTOP_IPC.browserRelease, (event, lease) => {
    assert.equal(event.sender, window.webContents)
    return guests.release(event.sender, lease)
  })
  await window.loadURL('data:text/html,<!doctype html><title>Native browser fixture</title><body></body>')
  const open = (url, proxy) => window.webContents.executeJavaScript(`(async () => {
    const reservation = await window.fixtureBrowser.acquire('cwd:/same-workspace', ${JSON.stringify(proxy)})
    const guest = document.createElement('webview')
    Object.assign(guest.style, { display: 'inline-flex', width: '640px', height: '360px' })
    guest.setAttribute('partition', reservation.partition)
    guest.setAttribute('src', 'about:blank#' + reservation.lease)
    const ready = new Promise(resolve => guest.addEventListener('dom-ready', resolve, { once: true }))
    document.body.append(guest)
    await ready
    const target = ${JSON.stringify(url)}
    const committed = new Promise((resolve, reject) => {
      guest.addEventListener('did-navigate', event => { if (event.url === target) resolve() })
      guest.addEventListener('did-fail-load', event => {
        if (event.isMainFrame && event.errorCode !== -3) reject(new Error(event.errorDescription))
      })
    })
    await Promise.all([committed, guest.loadURL(target)])
    return { ...reservation, url: guest.getURL() }
  })()`)
  const ordinary = await open(input.ordinary)
  stage = 'ordinary storage'
  const ordinaryStorage = session.fromPartition(ordinary.partition)
  await ordinaryStorage.cookies.set({ url: input.ordinary, name: 'ordinary-marker', value: 'ordinary' })
  const secure = await open(input.secure, input.routing)
  stage = 'Security storage and control checks'
  assert.equal(ordinary.url, input.ordinary)
  assert.equal(secure.url, input.secure)
  assert.notEqual(ordinary.partition, secure.partition)
  assert.equal((await ordinaryStorage.cookies.get({ name: 'ordinary-marker' }))[0]?.value, 'ordinary')
  assert.deepEqual(await session.fromPartition(secure.partition).cookies.get({ name: 'ordinary-marker' }), [])
  const secureGuest = native.get(secure.lease)
  assert(secureGuest, 'Native guest did not attach to its lease')
  assert.equal(secureGuest.getLastWebPreferences().sandbox, true)
  assert.equal(await secureGuest.executeJavaScript(`fetch(${JSON.stringify(input.control)}, {mode:'no-cors'}).then(() => false, () => true)`), true)
  if (input.trust !== undefined) {
    stage = 'certificate isolation'
    assert.equal(await secureGuest.executeJavaScript('document.body.textContent'), 'inspected sidebar HTTPS')
    const untrusted = session.fromPartition('untrusted-control')
    await untrusted.setProxy({ mode: 'fixed_servers', proxyRules: input.routing.server, proxyBypassRules: '<-loopback>' })
    await assert.rejects(untrusted.fetch(input.secure), /ERR_CERT_AUTHORITY_INVALID/u)
  }
  for (const lease of [secure.lease, ordinary.lease]) {
    stage = 'guest release'
    await window.webContents.executeJavaScript(`window.fixtureBrowser.release(${JSON.stringify(lease)})`)
  }
  assert.equal(native.size, 0)
  await new Promise(resolve => process.stdout.write('NATIVE_SIDEBAR_PROXY_PASS '
    + JSON.stringify({ isolation: true, ordinaryStorage: true, sandbox: true, controlBlocked: true, closed: true,
      ...(input.trust === undefined ? {} : { inspectedHttps: true, untrustedPartitionRefused: true }) }) + '\n', resolve))
}).catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  clearTimeout(timer)
  window?.destroy()
  app.exit(process.exitCode ?? 0)
})
