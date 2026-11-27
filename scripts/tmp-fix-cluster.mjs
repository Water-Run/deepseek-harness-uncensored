import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const ours = '69991db45894b8171850b817d8ef701630ad3d7f'
const git = (...args) => execFileSync('git', args, { stdio: 'ignore' })

for (const dir of ['packages/web/web-deepseek-api', 'packages/client/modules', 'packages/client/ui-primitives']) {
  try {
    git('rm', '-r', '-q', '--cached', dir)
  } catch {}
  execFileSync('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force '${dir}'`])
  git('checkout', ours, '--', dir)
  console.log(`restored ${dir}`)
}

// The account listing cache now receives credential headers instead of a bare token.
const accountPath = 'packages/llm/llm-deepseek-account/src/index.ts'
let account = readFileSync(accountPath, 'utf8')
account = account.replace(
  '    credential: url => resolveDeepSeekAccountToken(ctx, url),',
  "    credential: async url => { const token = await resolveDeepSeekAccountToken(ctx, url); return token === undefined ? undefined : { [TOKEN_HEADER]: token } },",
)
account = account.replace(
  '    load: (url, token, signal) => requestModelListing(url, { [TOKEN_HEADER]: token }, signal),',
  '    load: (url, headers, signal) => requestModelListing(url, headers, signal),',
)
writeFileSync(accountPath, account)

// List metadata is a projection value in the alpha.2 session query engine.
const listPath = 'packages/session-query/tool-session-list/src/list.ts'
let list = readFileSync(listPath, 'utf8')
list = list.replace(
  "      lastPromptAt: ctx.sessionQuery.getListMetadata(live).lastPromptAt,",
  "      lastPromptAt: ctx.sessionProjections.snapshot(live, ['sessionListMetadata']).values.sessionListMetadata?.lastPromptAt ?? null,",
)
writeFileSync(listPath, list)
console.log('patched account listing and list metadata')
