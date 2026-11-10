/** Real Chromium qualification of shared shell tokens and app-resolved palette changes. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, nativeTheme, protocol } from 'electron'
import { resolveDesktopLocale } from '../../lib/types/locale.js'
import { UPDATE_DIALOG_IPC } from '../../lib/types/update-dialog.js'
import { MANDATORY_IPC } from '../../lib/types/mandatory-update-ipc.js'

const root = process.env.DSH_LOCAL_UPDATE_TEST_ROOT
assert.ok(root, 'The launcher must allocate a private test root')
app.setPath('userData', join(root, 'electron'))
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.on('window-all-closed', () => {})

async function main() {
  await app.whenReady()
  const original = nativeTheme.themeSource
  const locale = resolveDesktopLocale('en')
  const results = []
  const windows = []
  const details = 'Download verification detail. '.repeat(40).trim()
  const deadline = setTimeout(() => { console.error('Theme qualification deadline exceeded'); app.exit(1) }, 30000)
  protocol.handle('dsh-app', async request => {
    const name = new URL(request.url).pathname.slice(1)
    const file = new URL(`${name === 'design-platform.css' ? '../../lib/welcome' : '../../renderer'}/${name}`, import.meta.url)
    const mime = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript'
      : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html'
    return new Response(await readFile(file), { headers: { 'content-type': mime } })
  })
  ipcMain.handle(UPDATE_DIALOG_IPC.status, () => ({ revision: 1, locale: locale.id,
    title: 'Check for updates', message: 'Update ready', detail: 'Shell palette qualification',
    buttons: ['Install', 'Later'], cancelId: 1, closeLabel: 'Close', technicalDetails: details, technicalDetailsLabel: 'Details' }))
  ipcMain.handle(MANDATORY_IPC.status, () => ({ locale, policy: { blocking: true, checking: false },
    update: { phase: 'error', failedOperation: 'download', version: '1.0.0', technicalDetails: details }, deferred: false }))
  try {
    assert.equal(await readFile(new URL('../../lib/welcome/design-platform.css', import.meta.url), 'utf8'),
      await readFile(new URL('../../../../packages/client/ui-theme/src/styles/design-platform.css', import.meta.url), 'utf8'))
    for (const [document, compact] of [
      ['update-dialog', false], ['mandatory-update', false], ['update-dialog', true], ['mandatory-update', true],
    ]) {
      for (const initial of ['light', 'dark']) {
        nativeTheme.themeSource = initial
        const window = new BrowserWindow({ show: false, frame: false, useContentSize: true,
          width: compact ? 390 : 600, height: compact ? 420 : 650,
          webPreferences: { preload: fileURLToPath(new URL(`../../lib/preload-${document === 'update-dialog' ? 'update-dialog' : 'mandatory'}.cjs`, import.meta.url)),
            contextIsolation: true, sandbox: true, nodeIntegration: false } })
        windows.push(window)
        await window.loadURL(`dsh-app://shell/${document}.html`)
        for (const source of [initial, initial === 'light' ? 'dark' : 'light', 'system']) {
          nativeTheme.themeSource = source
          const dark = nativeTheme.shouldUseDarkColors
          const colors = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
            const dark = ${dark};
            const deadline = setTimeout(() => { observer.disconnect(); reject(new Error('Palette did not settle')); }, 10000);
            const observer = new MutationObserver(check);
            function check() {
              if (!document.body.classList.contains('visible') || document.body.hasAttribute('data-ds-dark-theme') !== dark) return;
              observer.disconnect(); clearTimeout(deadline);
              const card = getComputedStyle(document.querySelector('main'));
              const primary = getComputedStyle(document.querySelector('.primary'));
              resolve({ dark, surface: card.backgroundColor, label: card.color, primary: primary.backgroundColor,
                primaryLabel: primary.color, boxShadow: card.boxShadow,
                diagnostic: getComputedStyle(document.querySelector('pre, #address')).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
                mask: getComputedStyle(document.body, '::before').backgroundColor,
                close: document.querySelector('.close') ? getComputedStyle(document.querySelector('.close'), '::before').backgroundColor : null });
            }
            observer.observe(document.body, { attributes: true }); check();
          })`)
          const { boxShadow, ...palette } = colors
          if (dark) assert.match(boxShadow, /0px 0px 0px 1px inset$/)
          else assert.equal(boxShadow, 'none')
          assert.deepEqual(palette, { dark, surface: dark ? 'rgb(35, 35, 36)' : 'rgb(255, 255, 255)',
            label: dark ? 'rgb(249, 250, 251)' : 'rgb(15, 17, 21)',
            primary: dark ? 'rgb(249, 250, 251)' : 'rgb(15, 17, 21)',
            primaryLabel: dark ? 'rgb(53, 54, 56)' : 'rgb(255, 255, 255)',
            diagnostic: dark ? 'rgb(27, 27, 28)' : 'rgb(249, 250, 251)', body: 'rgba(0, 0, 0, 0)',
            mask: dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.24)',
            close: document === 'update-dialog' ? dark ? 'rgb(249, 250, 251)' : 'rgb(15, 17, 21)' : null })
          const layout = await window.webContents.executeJavaScript(`(() => {
            const card = document.querySelector('main');
            const details = document.querySelector('details');
            const diagnostic = details.querySelector('pre');
            if (${compact} && !details.open) details.querySelector('summary').click();
            const bounds = card.getBoundingClientRect();
            const content = card.querySelector('.dialog-content');
            const footer = document.getElementById('actions');
            const primary = document.querySelector('.primary');
            const button = primary.getBoundingClientRect();
            const hit = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
            const scrollable = content.scrollHeight > content.clientHeight;
            if (scrollable) content.scrollTop = content.scrollHeight;
            const pinned = primary.getBoundingClientRect().top === button.top && (!scrollable || content.scrollTop > 0);
            content.scrollTop = 0;
            const scrollbar = getComputedStyle(content, '::-webkit-scrollbar');
            const thumb = getComputedStyle(content, '::-webkit-scrollbar-thumb');
            return {
              width: innerWidth, height: innerHeight, detailsOpen: details.open,
              cardFits: bounds.left >= 15 && bounds.right <= innerWidth - 15 &&
                bounds.top >= 15 && bounds.bottom <= innerHeight - 15,
              horizontalOverflow: document.documentElement.scrollWidth > innerWidth ||
                card.scrollWidth > card.clientWidth || content.scrollWidth > content.clientWidth,
              primaryReachable: button.height >= 44 && primary.contains(hit),
              footerOutsideContent: content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top && pinned,
              themedScrollbar: scrollbar.width === '5px' && thumb.backgroundColor !== 'rgba(0, 0, 0, 0)',
              detailsOverflow: details.open && diagnostic.scrollHeight > diagnostic.clientHeight,
              scrollable,
              isolated: typeof window.require === 'undefined',
            };
          })()`)
          const { width, height, scrollable, ...checks } = layout
          assert.ok(Math.abs(width - (compact ? 390 : 600)) <= 1 && Math.abs(height - (compact ? 420 : 650)) <= 1, 'Unexpected viewport')
          if (compact && document === 'mandatory-update') assert.equal(scrollable, true)
          assert.deepEqual(checks, {
            detailsOpen: compact, cardFits: true, horizontalOverflow: false, primaryReachable: true,
            footerOutsideContent: true, themedScrollbar: true, detailsOverflow: false, isolated: true,
          })
          results.push({ document, initial, source, layout, ...colors })
          if (source === initial) {
            await window.webContents.executeJavaScript('Promise.all(document.getAnimations().map(animation => animation.finished))')
            const image = await window.webContents.capturePage(undefined, { stayHidden: true })
            assert.equal(image.isEmpty(), false)
            await writeFile(join(root, `${document}-${initial}${compact ? '-compact' : ''}.png`), image.toPNG())
          }
        }
        assert.equal(window.isVisible(), false)
        window.destroy()
      }
    }
    await writeFile(join(root, 'result.json'), JSON.stringify(results, null, 2) + '\n')
    console.log(`Update theme qualification passed (${results.length} cases)`)
  } finally {
    clearTimeout(deadline)
    for (const window of windows) if (!window.isDestroyed()) window.destroy()
    ipcMain.removeHandler(UPDATE_DIALOG_IPC.status)
    ipcMain.removeHandler(MANDATORY_IPC.status)
    protocol.unhandle('dsh-app')
    nativeTheme.themeSource = original
  }
}
void main().then(() => app.exit(0), error => { console.error(error); app.exit(1) })
