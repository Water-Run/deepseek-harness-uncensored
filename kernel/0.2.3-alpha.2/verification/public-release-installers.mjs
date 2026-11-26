/** Compare a GitHub releases/latest API response on stdin with a staged five-installer release. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { json } from 'node:stream/consumers'
import { installerUpdateInfo } from '../../../apps/desktop/src/updates/github-release.ts'

const [directory, ...extra] = process.argv.slice(2)
if (!directory || extra.length) throw new Error('Pass the directory produced by deliver:github and pipe the GitHub releases/latest JSON response to stdin.')

const release = await json(process.stdin)
const files = new Map()
for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'arm64'], ['linux', 'x64'], ['linux', 'arm64']]) {
  const update = installerUpdateInfo(release, '0.0.0', platform, arch)
  for (const file of update.files) files.set(new URL(file.url).pathname.split('/').pop(), file)
}
if (files.size !== 5 || release.assets.length !== 5) throw new Error('Expected exactly five public installers for ' + release.tag_name)

const installers = join(directory, 'installers')
const local = await readdir(installers, { withFileTypes: true })
if (local.length !== files.size || local.some(entry => !entry.isFile() || !files.has(entry.name))) {
  throw new Error('Local installer names differ from GitHub ' + release.tag_name)
}
for (const [name, file] of files) {
  const sha256 = createHash('sha256'), sha512 = createHash('sha512')
  let size = 0
  for await (const chunk of createReadStream(join(installers, name))) {
    sha256.update(chunk)
    sha512.update(chunk)
    size += chunk.length
  }
  const asset = release.assets.find(entry => entry.name === name)
  if (size !== file.size || 'sha256:' + sha256.digest('hex') !== asset.digest || sha512.digest('base64') !== file.sha512) {
    throw new Error('Local installer bytes differ from GitHub metadata for ' + name)
  }
  console.log('%s  %d  %s', release.tag_name, size, name)
}
