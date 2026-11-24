/** Stage desktop installers and the payloads needed by clients migrating from the older updater. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { parseCalendarVersion } from '@deepseek-ai/dsh-product-version/bootstrap'
import yaml from 'js-yaml'
import { z } from 'zod'

const installers = [
  ['win-x64.exe', 'Windows x64'],
  ['mac-arm64.dmg', 'macOS Apple 芯片'],
  ['linux-x64.deb', 'Linux x64 · DEB'],
  ['linux-x64.rpm', 'Linux x64 · RPM'],
  ['linux-arm64.deb', 'Linux arm64 · DEB'],
] as const
const feeds = {
  'latest.yml': ['win-x64.exe'],
  'latest-mac.yml': ['mac-arm64.zip'],
  'latest-linux.yml': ['linux-x64.deb', 'linux-x64.rpm'],
  'latest-linux-arm64.yml': ['linux-arm64.deb'],
}
const receipt = z.object({ name: z.string(), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f\d]{64}$/iu) })
const manifestSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('release-manifest'), version: z.string(),
  artifacts: z.array(receipt), auxiliary: z.array(receipt).default([]), feeds: z.array(receipt).default([]),
})
const feedSchema = z.object({
  version: z.string(), files: z.array(z.object({ url: z.string(), size: z.number().int().positive(), sha512: z.string() })),
  path: z.string(), sha512: z.string(), packages: z.never().optional(),
})

function exactNames(actual: readonly string[], expected: readonly string[], subject: string): void {
  if (actual.length !== expected.length || new Set(actual).size !== expected.length || expected.some(name => !actual.includes(name))) {
    throw new Error(`GitHub release: expected ${subject} [${expected.join(', ')}]; received [${actual.join(', ')}]`)
  }
}

async function verifyFile(directory: string, file: z.infer<typeof receipt>): Promise<string> {
  const path = join(directory, file.name)
  const info = await lstat(path)
  if (!info.isFile() || info.size !== file.bytes) throw new Error(`GitHub release: unexpected file size for ${file.name}`)
  const sha256 = createHash('sha256'), sha512 = createHash('sha512')
  for await (const chunk of createReadStream(path)) { sha256.update(chunk as Buffer); sha512.update(chunk as Buffer) }
  if (sha256.digest('hex') !== file.sha256.toLowerCase()) throw new Error(`GitHub release: SHA-256 differs for ${file.name}`)
  return sha512.digest('base64')
}

/**
 * Create a new upload directory from the desktop collector's receipt. Failed validation leaves no upload directory.
 * @param from - Collected files and RELEASE-MANIFEST.json.
 * @param out - New directory for one version's attachments, upload list and release notes.
 * @param bridge - Include the previous client's automatic update indexes and macOS ZIP.
 */
export async function stageGithubRelease(from: string, out: string, bridge = false): Promise<void> {
  const source = resolve(from), destination = resolve(out)
  const manifest = manifestSchema.parse(JSON.parse(await readFile(join(source, 'RELEASE-MANIFEST.json'), 'utf8')))
  const version = parseCalendarVersion(manifest.version)
  if (!version || version.display !== manifest.version) throw new Error('GitHub release: expected the public calendar version')
  const name = (suffix: string): string => `DSHU-${version.display}-${suffix}`
  const zip = name('mac-arm64.zip')
  exactNames(manifest.artifacts.map(file => file.name), installers.map(([suffix]) => name(suffix)), 'installers')
  if (bridge) {
    exactNames(manifest.auxiliary.map(file => file.name), [zip], 'update payloads')
    exactNames(manifest.feeds.map(file => file.name), Object.keys(feeds), 'update indexes')
  }
  if (await lstat(destination).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false
    throw error
  })) throw new Error(`GitHub release: choose a new output directory: ${destination}`)

  await mkdir(dirname(destination), { recursive: true })
  const staging = await mkdtemp(join(dirname(destination), '.' + basename(destination) + '-'))
  try {
    const installDir = join(staging, 'installers'), updateDir = join(staging, 'updates')
    await mkdir(installDir)
    if (bridge) await mkdir(updateDir)
    const files = new Map<string, { size: number; sha512: string }>()
    const uploads: string[] = []
    for (const file of bridge ? [...manifest.artifacts, ...manifest.auxiliary] : manifest.artifacts) {
      const dir = file.name === zip ? updateDir : installDir
      await copyFile(join(source, file.name), join(dir, file.name))
      files.set(file.name, { size: file.bytes, sha512: await verifyFile(dir, file) })
    }
    const tag = 'v' + version.display
    const base = 'https://github.com/Water-Run/deepseek-harness-uncensored/releases/download/' + tag + '/'
    const notes = ['## 安装包', '', '| 系统 | 下载 |', '| --- | --- |']
    for (const [suffix, label] of installers) {
      const filename = name(suffix)
      uploads.push(`installers/${filename}#${label} · 安装包`)
      notes.push(`| ${label} | [${filename}](${base}${filename}) |`)
    }
    if (bridge) uploads.push(`updates/${zip}#macOS arm64 · 应用内更新包`)
    for (const [index, suffixes] of bridge ? Object.entries(feeds) : []) {
      const path = join(updateDir, index)
      await copyFile(join(source, index), path)
      await verifyFile(updateDir, manifest.feeds.find(file => file.name === index)!)
      const info = feedSchema.parse(yaml.load(await readFile(path, 'utf8')))
      exactNames(info.files.map(file => file.url), suffixes.map(name), index)
      if (info.version !== version.runtime || !info.files.some(file => file.url === info.path && file.sha512 === info.sha512)) {
        throw new Error(`GitHub release: invalid version or legacy path/digest in ${index}`)
      }
      for (const file of info.files) {
        const target = files.get(file.url)
        if (target?.size !== file.size || target.sha512 !== file.sha512) throw new Error(`GitHub release: invalid size or SHA-512 for ${file.url} in ${index}`)
      }
      uploads.push(`updates/${index}#更新索引 · ${index}`)
    }
    notes.push('')
    if (bridge) notes.push('旧版用户可在应用内检查更新。曾手动选择「开发版」的用户，请在设置中切回「正式版」，再检查更新。', '')
    else notes.push('若过渡前的旧版无法检查更新，请选择上方对应系统的安装包，手动安装一次。', '')
    const checksums = manifest.artifacts.map(file => ({
      name: file.name, size: file.bytes, sha256: file.sha256.toLowerCase(), sha512: files.get(file.name)!.sha512,
    }))
    notes.push('<!-- dshu-installers-v1 ' + JSON.stringify(checksums) + ' -->', '')
    await writeFile(join(staging, 'release-notes.md'), notes.join('\n'))
    await writeFile(join(staging, 'upload-files.txt'), uploads.join('\n') + '\n')
    await rename(staging, destination)
  } finally { await rm(staging, { recursive: true, force: true }) }
}

if (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { from: { type: 'string' }, out: { type: 'string' }, bridge: { type: 'boolean', default: false } } })
  if (!values.from || !values.out) throw new Error('Usage: stage-github-release --from <collected> --out <new directory> [--bridge]')
  await stageGithubRelease(values.from, values.out, values.bridge)
}
