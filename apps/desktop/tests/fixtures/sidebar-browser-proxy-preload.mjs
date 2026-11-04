/** Expose the product's browser bridge to the hidden fixture owner. */
import { contextBridge } from 'electron'
import { createDesktopBrowserBridge } from '../../lib/types/preload-browser.js'

contextBridge.exposeInMainWorld('fixtureBrowser', createDesktopBrowserBridge())
