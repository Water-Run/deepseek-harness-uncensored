// Three-way JSON merge for the kernel-upgrade conflict resolution.
// Base: rc.5, ours: DSHU product line, theirs: 0.2.3-alpha.2 kernel.
// Objects merge recursively, arrays union, scalars prefer ours except the listed keys.
import { readFileSync, writeFileSync } from 'node:fs'

const [baseArg, oursArg, theirsArg, outArg] = process.argv.slice(2)
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const preferTheirs = new Set(['version'])

function merge(base, ours, theirs, key) {
  if (JSON.stringify(ours) === JSON.stringify(base)) return theirs
  if (JSON.stringify(theirs) === JSON.stringify(base)) return ours
  if (ours && theirs && typeof ours === 'object' && typeof theirs === 'object' && !Array.isArray(ours) && !Array.isArray(theirs)) {
    const out = {}
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      out[k] = merge(base?.[k], ours[k], theirs[k], k)
    }
    return out
  }
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const out = [...ours]
    for (const item of theirs) if (!out.some(existing => JSON.stringify(existing) === JSON.stringify(item))) out.push(item)
    return out
  }
  if (preferTheirs.has(key)) return theirs
  return ours
}

const merged = merge(read(baseArg), read(oursArg), read(theirsArg), '')
writeFileSync(outArg, `${JSON.stringify(merged, null, 2)}\n`)
console.log('merged', outArg)
