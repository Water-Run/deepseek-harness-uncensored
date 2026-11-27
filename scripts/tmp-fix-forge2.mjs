import { readFileSync, writeFileSync } from 'node:fs'

const edits = [
  ['packages/experimental/client-ui-forge/tests/client-fixtures.client.ts',
    "readiness: { state: 'ready', message: null },",
    "readiness: { state: 'ready', message: null, signIn: null },"],
  ['packages/experimental/client-ui-forge/tests/changes-tab.client.spec.tsx',
    "return { headSha: HEAD, viewer: 'lin', threads: [], truncated: false, pendingReview: null, viewerCanReview: true, ...overrides }",
    "return { headSha: HEAD, viewer: 'lin', threads: [], truncated: false, pendingReview: null, viewerCanReview: true, reviewEvents: [], ...overrides }"],
  ['packages/experimental/client-ui-forge/tests/changes-tab.client.spec.tsx',
    "const REVIEW: ForgeReviewData = { headSha: HEAD, viewer: 'octo', threads: THREADS, truncated: false, pendingReview: null, viewerCanReview: false }",
    "const REVIEW: ForgeReviewData = { headSha: HEAD, viewer: 'octo', threads: THREADS, truncated: false, pendingReview: null, viewerCanReview: false, reviewEvents: [] }"],
  ['packages/experimental/client-ui-forge/src/client/ChangesTab.tsx',
    "    const path = navigation.params?.path",
    "    const path = (navigation.params as { path?: string } | undefined)?.path"],
  ['packages/client/ui-sidebar-browser/tests/browser-body.client.spec.tsx',
    "navigation: { address: 'sidebar://browser/1', params: navigation, revision: 0 },",
    "navigation: { address: 'sidebar://browser/1', params: navigation as unknown as Record<string, never>, revision: 0 },"],
]
for (const [file, from, to] of edits) {
  let text = readFileSync(file, 'utf8')
  if (!text.includes(from)) {
    console.log(`${file}: pattern missing -> ${from.slice(0, 50)}`)
    continue
  }
  writeFileSync(file, text.replace(from, to))
  console.log(`${file}: patched`)
}

// Forge readiness literals in the tab suite.
const forgeTab = 'packages/experimental/client-ui-forge/tests/forge-tab.client.spec.tsx'
let tab = readFileSync(forgeTab, 'utf8')
tab = tab.replace(/\{ state: 'unauthenticated', message(: [^}]+)? \}/g, (match) => match.includes('signIn') ? match : match.replace(' }', ', signIn: null }'))
tab = tab.replace(/\{ state: 'unavailable', message: ([^}]+) \}/g, (match) => match.includes('signIn') ? match : match.replace(' }', ', signIn: null }'))
writeFileSync(forgeTab, tab)
console.log('forge readiness literals updated')
