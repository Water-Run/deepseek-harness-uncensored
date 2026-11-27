import { readFileSync, writeFileSync } from 'node:fs'

const path = 'packages/llm/llm-deepseek-api-key/src/index.ts'
let text = readFileSync(path, 'utf8')
const before = text
text = text.replace(
  "    credential: async () => presentApiKey(options()),",
  "    credential: async () => { const key = await presentApiKey(options()); return key === undefined ? undefined : { 'x-api-key': key } },",
)
text = text.replace(
  "    load: (url, apiKey, signal) => requestModelListing(url, { 'x-api-key': apiKey }, signal),",
  '    load: (url, headers, signal) => requestModelListing(url, headers, signal),',
)
if (text === before) throw new Error('listing cache anchors missing')
writeFileSync(path, text)
console.log('adapted api-key listing cache to header credentials')
