/** Compare the built CLI's reported version with the repository's DSHU product version. */
import { displayProductVersion } from '@deepseek-ai/dsh-product-version/bootstrap'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.argv[2] ?? resolve(import.meta.dirname, '..')
const product: unknown = JSON.parse(readFileSync(resolve(root, 'product.json'), 'utf8'))
if (typeof product !== 'object' || product === null || !('version' in product) || typeof product.version !== 'string'
  || product.version.trim() === '') {
  throw new Error('CLI version check requires a product version in product.json')
}

const expected = displayProductVersion(product.version)
const result = spawnSync(process.execPath, [resolve(root, 'apps/cli/lib/bin.js'), '--version'], {
  cwd: root, encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL', windowsHide: true,
})
if (result.error !== undefined) throw result.error
if (result.status !== 0) {
  throw new Error(`Built CLI --version failed (${result.signal ?? result.status})\n${result.stderr}`)
}
const reported = result.stdout.trim()
if (reported !== expected) {
  throw new Error(`Built CLI --version printed ${JSON.stringify(reported)}, expected ${JSON.stringify(expected)} from product.json`)
}
console.log(`Built CLI product version matched ${expected}`)
