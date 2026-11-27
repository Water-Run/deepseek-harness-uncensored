import { readFileSync, writeFileSync } from 'node:fs'

const edits = [
  ['packages/client/ui-settings-session-log/tests/upload.client.spec.tsx',
    'render(<UploadRow {...props} t={key => translated[key] ?? key} />)',
    'render(<UploadRow {...props} t={(key: string) => translated[key] ?? key} />)'],
  ['packages/experimental/client-ui-forge/tests/forge-tab.client.spec.tsx',
    "{ state: 'unavailable', message }",
    "{ state: 'unavailable', message, signIn: null }"],
  ['packages/experimental/inspector/tests/bottom.client.spec.tsx',
    'await runtime.ctx.plugin(ShortcutsService).await()',
    'await runtime.ctx.plugin(ShortcutsService, {}).await()'],
]
for (const [file, from, to] of edits) {
  let text = readFileSync(file, 'utf8')
  if (!text.includes(from)) {
    console.log(`${file}: missing ${from.slice(0, 40)}`)
    continue
  }
  writeFileSync(file, text.replace(from, to))
  console.log(`${file}: patched`)
}

// Font notice augmentations live in the office entry.
const fontTest = 'packages/client/ui-sidebar-documentpreview/tests/office-font-notice.client.spec.tsx'
let font = readFileSync(fontTest, 'utf8')
if (!font.includes('../src/client/office/index.ts')) {
  const index = font.indexOf('import ')
  font = `${font.slice(0, index)}import type {} from '../src/client/office/index.ts'\n${font.slice(index)}`
  writeFileSync(fontTest, font)
  console.log('font notice loads office augmentations')
}

// The static module manifest export ships from the platform module.
const platform = 'packages/client/web/src/platform.ts'
let platformText = readFileSync(platform, 'utf8')
if (!platformText.includes('STATIC_MODULE_MANIFEST_EXPORT')) {
  platformText = platformText.replace(
    "/** The module specifiers the shell shares into the frozen module table. */",
    "/** Export name the static client bundle reserves for its module manifest. */\nexport const STATIC_MODULE_MANIFEST_EXPORT = '__$dsh_client_module_manifest'\n\n/** The module specifiers the shell shares into the frozen module table. */",
  )
  writeFileSync(platform, platformText)
  console.log('static module manifest export restored')
}

// ForgeTab forwards placement parameters to the sidebar navigation call.
const forgeTab = 'packages/experimental/client-ui-forge/src/client/ForgeTab.tsx'
let tab = readFileSync(forgeTab, 'utf8')
tab = tab.replace(
  "(nav.params as { path: string } | undefined) ?? undefined",
  "(nav.params as { path: string } | undefined) ?? undefined",
)
writeFileSync(forgeTab, tab)

// The kernel dispatches PTC work with one terminal event carrying JSON arguments.
const viewer = 'packages/experimental/liveshare/tests/viewer-fixture.client.ts'
let viewerText = readFileSync(viewer, 'utf8')
viewerText = viewerText.replace(
  /      push\(\{\n        type: 'tool\/ptc-dispatch-start',\n        data: \{[^}]*\},\n      \}\)\n/g,
  '',
)
viewerText = viewerText.replaceAll(
  'arguments: dispatchArgs, isError',
  'arguments: JSON.stringify(dispatchArgs), isError',
)
writeFileSync(viewer, viewerText)
console.log('liveshare dispatch fixture follows the kernel event')
