// Union DSHU-added source entries into the alpha.2 face configs adopted by the merge.
// Base: rc.5, ours: DSHU product line, theirs: 0.2.3-alpha.2 kernel.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [oursRef, theirsRef, listFile] = process.argv.slice(2)
const show = (ref, path) => {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8' })
  } catch {
    return undefined
  }
}
const paths = readFileSync(listFile, 'utf8').split('\n').map(line => line.trim()).filter(Boolean)
let updated = 0
const skipped = []
for (const path of paths) {
  if (path.endsWith('tsconfig.base.json') || path.endsWith('tsconfig.json')) continue
  const oursText = show(oursRef, path)
  const theirsText = show(theirsRef, path)
  if (!oursText || !theirsText) continue
  let ours
  let theirs
  try {
    ours = JSON.parse(oursText)
    theirs = JSON.parse(theirsText)
  } catch {
    skipped.push(path)
    continue
  }
  if (!Array.isArray(ours.files) || !Array.isArray(theirs.files)) continue
  const missing = ours.files.filter(entry => !theirs.files.includes(entry) && existsSync(join(dirname(path), entry)))
  if (missing.length === 0) continue
  theirs.files = [...theirs.files, ...missing]
  writeFileSync(path, `${JSON.stringify(theirs, null, 2)}\n`)
  updated++
  console.log(`${path}: +${missing.length}`)
}
console.log(`updated ${updated}; unparsable ${skipped.length}`)
