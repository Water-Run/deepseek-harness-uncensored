import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/desktop-host/src/index.ts'
let text = readFileSync(file, 'utf8')
if (!text.includes('desktopHostTrace')) {
  const helper = `\n/** Temporary boot trace while diagnosing packaged Host readiness; enabled by DSH_DESKTOP_BOOT_TRACE. */\nfunction desktopHostTrace(message: string): void {\n  if (process.env.DSH_DESKTOP_BOOT_TRACE === '1') console.error(\`desktop-host trace: \${new Date().toISOString()} \${message}\`)\n}\n`
  text = text.replace('async function main(): Promise<void> {', `${helper}\nasync function main(): Promise<void> {\n  desktopHostTrace('main entered')`)
  text = text.replace("  const runtimeDir = process.argv[2] as string", "  desktopHostTrace('secret received')\n  const runtimeDir = process.argv[2] as string")
  text = text.replace("  const profile = loadProfileDirectory('dsh', projectDir, installAnchor)", "  desktopHostTrace('loading profile')\n  const profile = loadProfileDirectory('dsh', projectDir, installAnchor)\n  desktopHostTrace('profile loaded')")
  text = text.replace("  const application = runProfile({", "  desktopHostTrace('booting application')\n  const application = runProfile({")
  text = text.replace("  const { ctx } = await application", "  desktopHostTrace('awaiting application')\n  const { ctx } = await application\n  desktopHostTrace('application booted')")
  text = text.replace("  await ctx.plugin(DesktopAuthentication, { readSecret: () => secret }).await()", "  desktopHostTrace('mounting desktop authentication')\n  await ctx.plugin(DesktopAuthentication, { readSecret: () => secret }).await()\n  desktopHostTrace('desktop authentication mounted')")
  text = text.replace("  process.send?.({ type: 'ready', url, injections }", "  desktopHostTrace('publishing ready')\n  process.send?.({ type: 'ready', url, injections }")
  writeFileSync(file, text)
  console.log('boot trace added')
}
