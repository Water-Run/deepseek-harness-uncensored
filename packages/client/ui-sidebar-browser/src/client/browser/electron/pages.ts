/** Assemble Electron navigation and presentation behind the shared BrowserPage interface. */
import type { DesktopBrowserBridge, DesktopBrowserProxy } from '../../../types.ts'
import type { BrowserPage, BrowserPageOptions } from '../BrowserPage.ts'
import { ElectronWebViewImpl } from './ElectronWebViewImpl.ts'
import { ElectronWebviewPresentation } from './ElectronWebviewPresentation.ts'

/**
 * Assemble an idle Electron provider; guest creation waits for mounting and navigation.
 * @param options - checkpoint and source-tab callbacks.
 * @param bridge - desktop-only transport.
 * @param workspace - storage account resolver.
 * @param proxy - optional Host-owned network resolver, re-read when the guest is recreated.
 * @returns separate navigation and presentation faces.
 */
export function createElectronPage(options: BrowserPageOptions, bridge: DesktopBrowserBridge,
  workspace: (signal: AbortSignal) => Promise<string>,
  proxy?: (signal: AbortSignal) => Promise<DesktopBrowserProxy | undefined>): BrowserPage {
  const presentation = new ElectronWebviewPresentation({
    mounted: () => { frame.attach() },
    unmounted: () => { frame.detach() },
  })
  const frame = new ElectronWebViewImpl(options, bridge, workspace, presentation, proxy)
  return { frame, presentation }
}
