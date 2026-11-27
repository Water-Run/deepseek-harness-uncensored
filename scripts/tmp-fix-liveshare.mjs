import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const client = 'packages/experimental/liveshare/src/client/endpoint-classification.ts'
let clientText = readFileSync(client, 'utf8')
clientText = clientText
  .split('\n')
  .map(line => line.startsWith('import { VIEWER_ENDPOINT_CLASSES')
    ? "import { VIEWER_ENDPOINT_CLASSES, type ViewerEndpointClass } from '../endpoint-classification.ts'"
    : line)
  .join('\n')
writeFileSync(client, clientText)

const table = 'packages/experimental/liveshare/src/endpoint-classification.ts'
if (existsSync(table)) {
  let tableText = readFileSync(table, 'utf8')
  if (!tableText.includes("'permissionPresets/set'")) {
    tableText = tableText.replace(
      /(\n(\s*)'liveshareShares\/updatePermissions': 'owner-only',)/,
      "$1\n$2'permissionPresets/set': 'owner-only',",
    )
    writeFileSync(table, tableText)
    console.log('permission preset endpoint classified')
  }
}
console.log('liveshare classification repaired')
