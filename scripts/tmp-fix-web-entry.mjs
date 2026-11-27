import { readFileSync, writeFileSync } from 'node:fs'

const webApp = 'packages/bundle/web-app/src/index.ts'
let web = readFileSync(webApp, 'utf8')
web = web.replace("import type { Context } from '@deepseek-ai/cordis'", "import { Context } from '@deepseek-ai/cordis'")
web = web.replace(
  "        const entries: { url: string }[] = []\n        connectionCtx.emit('webserver/entry-url', webUrl, entries)\n        const authenticatedUrl = entries[0]?.url ?? webUrl",
  "        const entries: { label: string; url: string; open?: boolean }[] = []\n        connectionCtx.emit(connectionCtx.webServer, 'webserver/entry-url', webUrl, entries as never)\n        const authenticatedUrl = entries[0]?.url ?? webUrl",
)
if (!web.includes("from '@deepseek-ai/dsh-host-webserver'")) {
  web = web.replace("import { Context } from '@deepseek-ai/cordis'", "import { Context } from '@deepseek-ai/cordis'\nimport type {} from '@deepseek-ai/dsh-host-webserver'")
}
writeFileSync(webApp, web)

const cli = 'apps/cli/src/profile-boot.ts'
let cliText = readFileSync(cli, 'utf8')
cliText = cliText.replace(/^import type \{ PatchOptions \}.*\n/m, '')
cliText = cliText.replace(/loadOverlayPatches,\s*/g, '')
writeFileSync(cli, cliText)
console.log('web bundle emits the entry-url event; unused CLI imports removed')
