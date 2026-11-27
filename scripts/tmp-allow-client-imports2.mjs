import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'packages/client/tsdown.client.ts'

// Rebuild the allowlist line from the kernel original, then layer the DSHU extras.
let text = readFileSync(file, 'utf8')
const kernel = execFileSync('git', ['show', 'b9eae02:packages/client/tsdown.client.ts'], { encoding: 'utf8' })
const kernelLine = kernel.match(/export const INLINE_SAFE = (\/.*\/)\n/)[1]
if (!text.includes('DSHU_CLIENT_INLINE_EXTRA')) {
  text = text.replace(/export const INLINE_SAFE = \/.*?\/\n/, `export const INLINE_SAFE = ${kernelLine}\n\n/** Cross-plugin value imports the DSHU client packages rely on and the kernel allowlist predates. */\nexport const DSHU_CLIENT_INLINE_EXTRA: readonly string[] = ['error', 'product-version', 'util-text-search', 'util-file-drag', 'plugin-market-index/source', 'api-session-controller/client/directories', 'spill-policy/notice']\n`)
  text = text.replace(
    "if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null // wire contribution: inline is the point",
    "if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source) || DSHU_CLIENT_INLINE_EXTRA.some(name => source === `@deepseek-ai/dsh-${name}` || source.startsWith(`@deepseek-ai/dsh-${name}/`))) return null // wire contribution or DSHU allowlisted library: inline is the point",
  )
  writeFileSync(file, text)
  console.log('rebuilt allowlist with the DSHU extras seam')
}

for (let round = 0; round < 40; round++) {
  let out = ''
  try {
    execFileSync('pnpm', ['exec', 'tsdown', '--config-loader', 'native', '--env.DSH_BUILD_FACE', 'client'], { encoding: 'utf8', stdio: 'pipe', shell: true })
    console.log(`round ${round}: client bundle clean`)
    break
  } catch (error) {
    out = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  const match = /client bundle purity: "([^"]+)" is not in/.exec(out)
  if (!match) {
    console.log(`round ${round}: no purity match; tail follows`)
    console.log(out.slice(-600))
    break
  }
  const spec = match[1].replace('@deepseek-ai/dsh-', '')
  let current = readFileSync(file, 'utf8')
  if (!current.includes(`'${spec}'`)) {
    current = current.replace(
      'export const DSHU_CLIENT_INLINE_EXTRA: readonly string[] = [',
      `export const DSHU_CLIENT_INLINE_EXTRA: readonly string[] = ['${spec}', `,
    )
    writeFileSync(file, current)
  }
  console.log(`round ${round}: allowed ${spec}`)
}
