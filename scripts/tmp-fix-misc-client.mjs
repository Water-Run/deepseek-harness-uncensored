import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const edits = [
  ['packages/client/ui-settings-memory/tests/source-status.client.spec.tsx', 'as Parameters<typeof MemoryRow>[0]', 'as unknown as Parameters<typeof MemoryRow>[0]'],
  ['packages/client/ui-settings-session-log/tests/upload.client.spec.tsx', 'as ComponentProps<typeof UploadRow>', 'as unknown as ComponentProps<typeof UploadRow>'],
]
for (const [file, from, to] of edits) {
  let text = readFileSync(file, 'utf8')
  if (!text.includes(from)) {
    console.log(`${file}: pattern missing`)
    continue
  }
  writeFileSync(file, text.replace(from, to))
  console.log(`${file}: cast relaxed`)
}

const fontTest = 'packages/client/ui-sidebar-documentpreview/tests/office-font-notice.client.spec.tsx'
let font = readFileSync(fontTest, 'utf8')
const indexTarget = '../src/client/index.ts'
if (!font.includes(indexTarget)) {
  const index = font.indexOf('import ')
  font = `${font.slice(0, index)}import type {} from '${indexTarget}'\n${font.slice(index)}`
  writeFileSync(fontTest, font)
  console.log('font notice test loads package augmentations')
}

// Kernel forge data carries review events and the readiness sign-in state.
const reviewDataFiles = [
  'packages/experimental/client-ui-forge/tests/changes-tab.client.spec.tsx',
  'packages/experimental/client-ui-forge/tests/client-fixtures.client.ts',
  'packages/experimental/client-ui-forge/tests/forge-tab.client.spec.tsx',
]
for (const file of reviewDataFiles) {
  let text = readFileSync(file, 'utf8')
  let changed = false
  const reviewPattern = /(reviewEvents\?: readonly [A-Za-z]+\[\],?)/g
  if (reviewPattern.test(text) && text.includes('reviewEvents?') === false) changed = changed || false
  text = text.replace(/\bviewerCanReview: (true|false),\n(\s*)\}/g, (match, value, indent) => {
    if (match.includes('reviewEvents')) return match
    return `viewerCanReview: ${value},\n${indent}  reviewEvents: [],\n${indent}}`
  })
  text = text.replace(/\bmessage: (null|'[^']*'|"[^"]*"),\n(\s*)\}/g, (match, message, indent) => {
    if (match.includes('signIn')) return match
    return `message: ${message},\n${indent}  signIn: null,\n${indent}}`
  })
  writeFileSync(file, text)
  console.log(`${file}: forge literals updated`)
}

// Forge navigation parameters now name the resource kind explicitly.
const changesTab = 'packages/experimental/client-ui-forge/src/client/ChangesTab.tsx'
let changes = readFileSync(changesTab, 'utf8')
changes = changes.replace(/params\.path/g, "('path' in params ? params.path : undefined)")
writeFileSync(changesTab, changes)
console.log('forge path access adapted')
