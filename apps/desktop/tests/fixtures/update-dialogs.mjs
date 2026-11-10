/** Real isolated update dialogs; installer handoff is recorded by the caller's inert updater. */
import { DesktopUpdateOverlays } from '../../lib/types/update-overlay.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, nativeTheme, protocol } from 'electron'
import { DesktopUpdateDialog } from '../../lib/types/update-dialog.js'
import { DesktopBackgroundNotice } from '../../lib/types/background-notice.js'
import { desktopUpdateReadyConfirmation, resolveDesktopLocale } from '../../lib/types/locale.js'

async function rendered(window) {
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const observer = new MutationObserver(check);
    const deadline = setTimeout(() => { observer.disconnect(); reject(new Error('Dialog did not render')); }, 10000);
    function check() { if (document.querySelector('main:not([hidden])')) { observer.disconnect(); clearTimeout(deadline); resolve(); } }
    observer.observe(document, { subtree: true, attributes: true }); check();
  })`)
}

/** Exercise cancellation and explicit installation through the production preload and renderer. */
export async function qualifyUpdateDialogs(root, fixture, hiddenWindows) {
  const theme = nativeTheme.themeSource
  nativeTheme.themeSource = 'light'
  const locale = resolveDesktopLocale('zh-CN')
  const messages = locale.messages
  const screenshots = []
  protocol.handle('dsh-app', async request => {
    const name = new URL(request.url).pathname.slice(1)
    assert.ok(['design-platform.css', 'shell-theme.js', 'update-dialog.html', 'update-dialog.js', 'update-dialog.css', 'update-close.svg'].includes(name))
    const mime = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css'
      : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html'
    return new Response(await readFile(new URL(`${name === 'design-platform.css' ? '../../lib/welcome' : '../../renderer'}/${name}`, import.meta.url)), { headers: { 'content-type': mime } })
  })
  const parent = new BrowserWindow({ show: !hiddenWindows, skipTaskbar: hiddenWindows, width: 900, height: 650,
    webPreferences: { backgroundThrottling: !hiddenWindows } })
  const dialogs = new DesktopUpdateDialog(fileURLToPath(new URL('../../lib/preload-update-dialog.cjs', import.meta.url)), locale, new DesktopUpdateOverlays())
  async function capture(contents, name) {
    if (hiddenWindows) return
    const image = await contents.capturePage()
    assert.equal(image.isEmpty(), false, name)
    await writeFile(join(root, name), image.toPNG())
    screenshots.push(name)
  }
  async function escape(contents) {
    if (hiddenWindows) {
      await contents.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))")
    } else contents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  }
  try {
    await parent.loadURL('data:text/html;charset=utf-8,<title>Update dialog qualification</title><h1>Local updater</h1>')
    const f = await fixture()
    const available = await f.coordinator.check()
    await f.coordinator.download(available.version)
    assert.equal(f.installations.length, 0)
    for (const active of [false, true]) {
      const ready = desktopUpdateReadyConfirmation(messages, available.version, process.platform)
      const options = {
        title: messages.updateTitle,
        message: active ? messages.updateActiveTasks : ready.message,
        detail: active ? messages.updateActiveTasksDetail : ready.detail,
        buttons: active ? [messages.updateStopTasks, messages.updateLater] : [messages.installAndRestart], cancelId: 1,
      }
      f.restart(async () => (await dialogs.show(parent, options)).response === 0)
      const created = once(app, 'web-contents-created', { signal: AbortSignal.timeout(10_000) })
      const pending = f.coordinator.install(available.version)
      const [, contents] = await created
      const window = { webContents: contents, isDestroyed: () => contents.isDestroyed() }
      await once(window.webContents, 'did-finish-load', { signal: AbortSignal.timeout(10_000) })
      await rendered(window)
      const view = await window.webContents.executeJavaScript(`({
        title: document.getElementById('title').textContent,
        detail: document.getElementById('detail').textContent,
        buttons: [...document.querySelectorAll('#actions button')].map(button => button.textContent),
        width: document.querySelector('main').getBoundingClientRect().width,
        radius: getComputedStyle(document.querySelector('main')).borderRadius,
        primary: getComputedStyle(document.querySelector('.primary')).backgroundColor,
        focused: document.activeElement.id, isolated: typeof window.require === 'undefined',
      })`)
      assert.deepEqual(view, { title: options.message, detail: options.detail, buttons: options.buttons,
        width: 380, radius: '24px', primary: 'rgb(15, 17, 21)', focused: 'dialog', isolated: true })
      assert.equal(await parent.webContents.executeJavaScript('getComputedStyle(document.body).filter'), 'none')
      assert.equal(f.installations.length, 0)
      assert.equal(await window.webContents.executeJavaScript(`
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
        document.activeElement.id`), 'close')
      assert.equal(await window.webContents.executeJavaScript(`
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
        document.activeElement.textContent`), options.buttons.at(-1))
      await window.webContents.executeJavaScript("document.getElementById('dialog').focus()")
      const name = active ? 'update-active-tasks.png' : 'update-ready.png'
      await capture(window.webContents, name)
      const closed = once(window.webContents, 'destroyed', { signal: AbortSignal.timeout(10_000) })
      const response = active ? window.webContents.executeJavaScript("document.querySelector('.primary').click()")
        : escape(window.webContents)
      const [result] = await Promise.all([pending, closed, response])
      assert.equal(window.isDestroyed(), true)
      assert.equal(result.phase, active ? 'installing' : 'ready')
      assert.equal(f.installations.length, active ? 1 : 0)
    }
    assert.deepEqual(f.installations, [[true, true]])
    const created = once(app, 'web-contents-created', { signal: AbortSignal.timeout(10_000) })
    const diagnostics = 'exit 0; shutdown acknowledged false\n' + 'at internal/diagnostic/path\n'.repeat(1000)
    const pending = dialogs.show(parent, { title: messages.updateFailedTitle, message: messages.updateStopFailed,
      technicalDetails: diagnostics })
    const [, errorContents] = await created
    const errorWindow = { webContents: errorContents }
    await once(errorWindow.webContents, 'did-finish-load', { signal: AbortSignal.timeout(10_000) })
    await rendered(errorWindow)
    assert.equal(await errorWindow.webContents.executeJavaScript("document.getElementById('technical-details').open"), false)
    for (const expanded of [false, true]) {
      if (expanded) {
        assert.equal(await errorWindow.webContents.executeJavaScript("document.getElementById('technical-details-label').click(); document.getElementById('technical-details').open"), true)
        assert.equal(await errorWindow.webContents.executeJavaScript("document.getElementById('technical-details-content').textContent"), diagnostics)
        assert.equal(await errorWindow.webContents.executeJavaScript(`(() => {
          const detail = document.getElementById('technical-details-content');
          const button = document.querySelector('.primary').getBoundingClientRect();
          return detail.scrollHeight > detail.clientHeight && detail.getBoundingClientRect().height <= 180
            && button.top >= 0 && button.bottom <= innerHeight;
        })()`), true)
      }
      const name = expanded ? 'update-error-expanded.png' : 'update-error-collapsed.png'
      await capture(errorWindow.webContents, name)
    }
    assert.deepEqual(f.installations, [[true, true]])
    const closedError = once(errorWindow.webContents, 'destroyed', { signal: AbortSignal.timeout(10_000) })
    const [errorResult] = await Promise.all([pending, closedError, escape(errorWindow.webContents)])
    assert.equal(errorResult.response, 0)
    const markerPath = join(root, 'background-close-confirmed')
    const notice = new DesktopBackgroundNotice({ markerPath, locale: () => locale,
      show: options => dialogs.show(parent, options), focus: () => dialogs.focus() })
    try {
      for (const confirm of [false, true]) {
        if (!hiddenWindows) parent.show()
        const createdNotice = once(app, 'web-contents-created', { signal: AbortSignal.timeout(10_000) })
        const hidden = Promise.withResolvers()
        let closeConfirmed = false
        notice.close(() => { closeConfirmed = true; parent.hide(); hidden.resolve() })
        const [, noticeContents] = await createdNotice
        const noticeWindow = { webContents: noticeContents }
        await once(noticeWindow.webContents, 'did-finish-load', { signal: AbortSignal.timeout(10_000) })
        await rendered(noticeWindow)
        assert.equal(parent.isVisible(), !hiddenWindows)
        assert.deepEqual(await noticeWindow.webContents.executeJavaScript(`({
          message: document.getElementById('title').textContent,
          buttons: [...document.querySelectorAll('#actions button')].map(button => button.textContent),
          detailHidden: document.getElementById('detail').hidden,
        })`), JSON.parse(await readFile(new URL('../expected/background-close-confirmation.json', import.meta.url), 'utf8')))
        await assert.rejects(access(markerPath))
        if (confirm && !hiddenWindows) {
          const name = 'background-close-confirmation.png'
          await noticeWindow.webContents.executeJavaScript(`Promise.all(document.getAnimations().map(animation => animation.finished))`)
          await capture(noticeWindow.webContents, name)
        }
        const closedNotice = once(noticeWindow.webContents, 'destroyed', { signal: AbortSignal.timeout(10_000) })
        if (confirm) {
          await Promise.all([closedNotice, hidden.promise, noticeWindow.webContents.executeJavaScript("document.querySelector('.primary').click()")])
        } else await Promise.all([closedNotice, escape(noticeWindow.webContents)])
        assert.equal(closeConfirmed, confirm)
        assert.equal(parent.isVisible(), !hiddenWindows && !confirm)
      }
      await access(markerPath)
      if (!hiddenWindows) parent.show()
      let closedAgain = false
      notice.close(() => { closedAgain = true; parent.hide() })
      assert.equal(closedAgain, true)
      assert.equal(parent.isVisible(), false)
      assert.equal(dialogs.isOpen, false)
    } finally { notice.dispose() }
    return screenshots
  } finally {
    dialogs.dispose()
    parent.destroy()
    protocol.unhandle('dsh-app')
    nativeTheme.themeSource = theme
  }
}
