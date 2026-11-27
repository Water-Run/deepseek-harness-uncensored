import { readFileSync, writeFileSync } from 'node:fs'

const patch = 'packages/bundle/web-app/cordis.patch.yml'
let text = readFileSync(patch, 'utf8')
const anchor = '        trustedHosts: !!js ctx.webStartup.trustedHosts\n'
if (!text.includes('authentication-token')) {
  text = text.replace(
    anchor,
    `${anchor}\n    # Launch-token browser authentication: the printed URL carries the process\n    # token, and admitted API sockets bind to one owner Peer.\n    - id: authentication-token\n      name: '@deepseek-ai/dsh-host-authentication-token'\n`,
  )
  writeFileSync(patch, text)
  console.log('auth row inserted')
}

const manifest = 'packages/bundle/web-app/package.json'
const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
parsed.dependencies = parsed.dependencies ?? {}
parsed.dependencies['@deepseek-ai/dsh-host-authentication-token'] = 'workspace:*'
writeFileSync(manifest, `${JSON.stringify(parsed, null, 2)}\n`)
console.log('web-app bundle depends on token authentication')
