import { readFileSync, writeFileSync } from 'node:fs'

const file = 'packages/client/hmr/src/client/index.ts'
let text = readFileSync(file, 'utf8')
const anchor = "  const unmount = await ctx.remote.$mount(pluginEventsRemote)"
if (!text.includes(anchor)) {
  console.log('anchor missing')
  process.exit(0)
}
text = text.replace(anchor, `  // A carrier that already mounted this contribution (the test runtime proxies namespaces with scripted rules) keeps it.
  const unmount = ctx.get('remote.pluginEvents') === undefined
    ? await ctx.remote.$mount(pluginEventsRemote)
    : async (): Promise<void> => {}`)
writeFileSync(file, text)
console.log('hmr remote mount guarded')
