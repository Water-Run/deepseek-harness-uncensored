import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const forge = 'packages/experimental/client-ui-forge/src/client/ChangeRequestCard.tsx'
let forgeText = readFileSync(forge, 'utf8')
if (!forgeText.includes("'rate-limited'")) {
  forgeText = forgeText.replace(
    "  'unavailable': 'change.failure.unavailable',",
    "  'rate-limited': 'change.failure.unavailable',\n  'unavailable': 'change.failure.unavailable',",
  )
  writeFileSync(forge, forgeText)
}

const liveshare = 'packages/experimental/liveshare/src/client/endpoint-classification.ts'
let text = readFileSync(liveshare, 'utf8')
if (!text.includes("'permissionPresets/set'")) {
  const anchor = text.match(/\n(\s*)'liveshareShares\/updatePermissions': 'owner-only',/)
  const indent = anchor?.[1] ?? '  '
  const line = `${indent}'permissionPresets/set': 'owner-only',`
  if (anchor) {
    text = text.replace(anchor[0], `\n${line}${anchor[0]}`)
  } else {
    // Append to the end of the classification table.
    const tableEnd = text.lastIndexOf('}')
    text = `${text.slice(0, tableEnd)}${line}\n${text.slice(tableEnd)}`
  }
  writeFileSync(liveshare, text)
}
console.log('forge and liveshare maps updated')
