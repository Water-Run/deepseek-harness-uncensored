import { readFileSync, writeFileSync } from 'node:fs'

const collectPath = 'packages/boot/app-boot/src/config-schema/collect.ts'
let collect = readFileSync(collectPath, 'utf8')
const oldAt = 'const at = error instanceof yaml.YAMLException ? ` at line ${error.mark.line + 1}, column ${error.mark.column + 1}` : \'\''
const newAt = 'const position = entryYamlErrorPosition(error)\n          const at = position === undefined ? \'\' : ` at line ${position.line + 1}, column ${position.column + 1}`'
if (!collect.includes(oldAt)) throw new Error('collect catch anchor missing')
collect = collect.replace(oldAt, newAt)
writeFileSync(collectPath, collect)

const preflightPath = 'packages/boot/app-boot/src/compatibility-preflight.ts'
let preflight = readFileSync(preflightPath, 'utf8')
preflight = preflight.replace(/import \{ load \} from 'js-yaml'\r?\n/, '')
writeFileSync(preflightPath, preflight)
console.log('patched include API call sites')
