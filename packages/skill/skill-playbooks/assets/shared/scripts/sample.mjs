#!/usr/bin/env node
/**
 * Sample inventory for the reverse-engineering playbooks.
 *
 * Streams a file once and reports hashes, size, magic-derived format, byte
 * entropy, and printable ASCII strings. Node built-ins only.
 *
 * Usage:
 *   node sample.mjs PATH [--min 6] [--max 200] [--out inventory.json]
 */

import { createHash } from 'node:crypto'
import { createReadStream, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CHUNK = 1 << 20
const ENTROPY_WINDOW = 64 * CHUNK
const OVERLAP = 64
const TEXT_WINDOW = 4 << 20

function parseArgs(argv) {
  const options = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      options._.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next
      index += 1
    } else {
      options[key] = true
    }
  }
  return options
}

const FORMATS = [
  { name: 'PE', test: bytes => bytes[0] === 0x4d && bytes[1] === 0x5a },
  { name: 'ELF', test: bytes => bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46 },
  { name: 'Mach-O', test: bytes => [0xcffaedfe, 0xfeedfacf, 0xcefaedfe, 0xfeedface, 0xcafebabe].includes(bytes.readUInt32BE(0)) },
  { name: 'ZIP/APK/JAR', test: bytes => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04 },
  { name: 'PDF', test: bytes => bytes.subarray(0, 4).toString('latin1') === '%PDF' },
  { name: 'OLE/Office', test: bytes => bytes.readUInt32BE(0) === 0xd0cf11e0 },
  { name: 'SQLite', test: bytes => bytes.subarray(0, 15).toString('latin1') === 'SQLite format 3' },
  { name: 'WASM', test: bytes => bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d },
  { name: 'GZIP', test: bytes => bytes[0] === 0x1f && bytes[1] === 0x8b },
  { name: 'PNG', test: bytes => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 },
]

function magicOf(head) {
  for (const format of FORMATS) {
    try {
      if (format.test(head)) return format.name
    } catch {
      // A short file cannot satisfy a multi-byte signature.
    }
  }
  return 'unknown'
}

function entropyOf(counts, total) {
  if (total === 0) return 0
  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / total
    entropy -= probability * Math.log2(probability)
  }
  return Number(entropy.toFixed(3))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const input = options._[0]
  if (input === undefined) {
    process.stderr.write('sample: usage: node sample.mjs PATH [--min 6] [--max 200] [--out inventory.json]\n')
    process.exit(2)
  }
  const path = resolve(input)
  const minLength = Number(options.min ?? 6)
  const maxStrings = Number(options.max ?? 200)
  const hashes = { md5: createHash('md5'), sha1: createHash('sha1'), sha256: createHash('sha256') }
  let size = 0
  let head = Buffer.alloc(0)
  let entropyBytes = 0
  const counts = new Map()
  let textBudget = TEXT_WINDOW
  const strings = []
  let tail = ''

  const stream = createReadStream(path, { highWaterMark: CHUNK })
  for await (const chunk of stream) {
    size += chunk.length
    for (const hash of Object.values(hashes)) hash.update(chunk)
    if (head.length < 4096) head = Buffer.concat([head, chunk]).subarray(0, 4096)
    if (entropyBytes < ENTROPY_WINDOW) {
      for (const byte of chunk) counts.set(byte, (counts.get(byte) ?? 0) + 1)
      entropyBytes += chunk.length
    }
    if (strings.length < maxStrings && textBudget > 0) {
      textBudget -= chunk.length
      const matches = (tail + chunk.toString('latin1')).match(/[\x20-\x7e]{6,}/gu) ?? []
      for (const match of matches) {
        if (match.length >= minLength && strings.length < maxStrings) strings.push(match)
      }
      tail = (tail + chunk.toString('latin1')).slice(-OVERLAP)
    }
  }

  const result = {
    path,
    size,
    hashes: {
      md5: hashes.md5.digest('hex'),
      sha1: hashes.sha1.digest('hex'),
      sha256: hashes.sha256.digest('hex'),
    },
    magicHex: head.subarray(0, 16).toString('hex'),
    magicAscii: head.subarray(0, 16).toString('latin1').replace(/[^\x20-\x7e]/gu, '.'),
    format: magicOf(head),
    entropy: entropyOf(counts, entropyBytes),
    strings,
    first64Hex: head.subarray(0, 64).toString('hex'),
  }
  const text = `${JSON.stringify(result, null, 2)}\n`
  if (typeof options.out === 'string') {
    writeFileSync(resolve(options.out), text)
    process.stdout.write(`${resolve(options.out)}\n`)
  } else {
    process.stdout.write(text)
  }
}

main().catch((error) => {
  process.stderr.write(`sample: ${error.message}\n`)
  process.exit(1)
})
