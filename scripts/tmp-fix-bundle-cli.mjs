import { readFileSync, writeFileSync } from 'node:fs'

// CLI profile context carries overlay paths; the kernel loads them itself.
const cli = 'apps/cli/src/profile-boot.ts'
let cliText = readFileSync(cli, 'utf8')
cliText = cliText.replace(
  '  /** Command-line overlay contents, frozen for this invocation. */\n  overlays: PatchOptions[]',
  '  /** Absolute command-line overlay paths, frozen for this invocation. */\n  overlayPaths: string[]',
)
cliText = cliText.replace(
  '  const overlays = patchFiles.flatMap(file => loadOverlayPatches(NAME, resolve(file)))\n  return { profile, resolution, overlays }',
  '  const overlayPaths = patchFiles.map(file => resolve(file))\n  return { profile, resolution, overlayPaths }',
)
cliText = cliText.replace(
  'overlays: composed.overlays, telemetryDisabledEnv:',
  'overlayPaths: composed.overlayPaths, telemetryDisabledEnv:',
)
writeFileSync(cli, cliText)
console.log('CLI profile context uses overlay paths')

// The web bundle announces through Cordis symbols and the entry-url event.
const webApp = 'packages/bundle/web-app/src/index.ts'
let web = readFileSync(webApp, 'utf8')
web = web.replaceAll('connectionCtx.root', 'connectionCtx[Context.root]')
web = web.replace(
  '        const authenticatedUrl = connectionCtx.connection.authenticatedUrl(webUrl)',
  "        const entries: { url: string }[] = []\n        connectionCtx.emit('webserver/entry-url', webUrl, entries)\n        const authenticatedUrl = entries[0]?.url ?? webUrl",
)
writeFileSync(webApp, web)
console.log('web bundle announces through the entry-url event')
