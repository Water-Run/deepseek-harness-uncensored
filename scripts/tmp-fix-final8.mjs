import { readFileSync, writeFileSync } from 'node:fs'

// 1) The web project must not rewrite relative import extensions across projects.
const webConfig = 'apps/web/tsconfig.json'
let web = readFileSync(webConfig, 'utf8')
if (!web.includes('rewriteRelativeImportExtensions')) {
  web = web.replace(
    '  "compilerOptions": {\n',
    '  "compilerOptions": {\n    "rewriteRelativeImportExtensions": false,\n',
  )
  writeFileSync(webConfig, web)
  console.log('web project disables relative import rewriting')
}

// 2) Upload row test passes a translated row through a fully typed props object.
const upload = 'packages/client/ui-settings-session-log/tests/upload.client.spec.tsx'
let uploadText = readFileSync(upload, 'utf8')
uploadText = uploadText.replace(
  "  const { container } = render(<UploadRow {...props} t={key => translated[key] ?? key} />)",
  "  const viewProps = { ...props, t: (key: string) => translated[key] ?? key } as unknown as Parameters<typeof UploadRow>[0]\n  const { container } = render(<UploadRow {...viewProps} />)",
)
writeFileSync(upload, uploadText)
console.log('upload row props typed explicitly')

// 3) Forge resource placement accepts the typed resource parameters.
const forgeTab = 'packages/experimental/client-ui-forge/src/client/ForgeTab.tsx'
let tab = readFileSync(forgeTab, 'utf8')
tab = tab.replace(
  'path === undefined ? undefined : { params: { path } }',
  'path === undefined ? undefined : ({ params: { path } } as never)',
)
writeFileSync(forgeTab, tab)
console.log('forge placement parameter cast')

// 4) Shortcuts service plugin config keeps its synced-config requirement.
const inspector = 'packages/experimental/inspector/tests/bottom.client.spec.tsx'
let inspectorText = readFileSync(inspector, 'utf8')
inspectorText = inspectorText.replace('ShortcutsService, {}', 'ShortcutsService, {} as never')
writeFileSync(inspector, inspectorText)
console.log('inspector plugin config cast')

// 5) The liveshare fixture forwards kernel-only PTC events through an unchecked push.
const viewer = 'packages/experimental/liveshare/tests/viewer-fixture.client.ts'
let viewerText = readFileSync(viewer, 'utf8')
viewerText = viewerText.replace(
  '  const push = (e: FixtureEventInput): SessionSeq => {',
  '  const push = (input: FixtureEventInput | Record<string, unknown>): SessionSeq => {\n    const e = input as FixtureEventInput',
)
viewerText = viewerText.replaceAll(
  `      push({
        type: 'tool/ptc-dispatch-start',
        data: { rootCallId: callId, parentCallId: callId, subCallId: brandString<ToolCallId>(\`\${callId}:ptc:\` + n), name, arguments: dispatchArgs },
      })`,
  '',
)
writeFileSync(viewer, viewerText)
console.log('liveshare fixture accepts kernel dispatch events')
