/**
 * Read-only sample inventory.
 *
 * This is the service-side counterpart of
 * `assets/shared/scripts/sample.mjs`: the same facts (hashes, format guess,
 * entropy, printable strings) computed from bytes that were read and never
 * executed. Nothing here spawns a process, loads a library, or writes a file.
 */

import { createHash } from 'node:crypto'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { SampleInspection } from './types.ts'
import { DossierProblemError, normalizeRelativePath, resolveInside, resolveOptions } from './files.ts'

/** Printable runs shorter than this are noise rather than strings. */
const MIN_STRING_LENGTH = 4

/** Printable runs longer than this are cut, keeping the preview readable. */
const MAX_STRING_LENGTH = 120

/** Number of printable runs one inventory returns. */
const MAX_STRINGS = 40

/** Bytes inspected when recognizing a container format. */
const MAGIC_BYTES = 16

/** One recognized container format. */
interface FormatSignature {
  readonly id: string
  readonly offset: number
  readonly bytes: readonly number[]
}

/** Container signatures this build recognizes; an unknown file reports none. */
const FORMAT_SIGNATURES: readonly FormatSignature[] = [
  { id: 'elf', offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { id: 'pe', offset: 0, bytes: [0x4d, 0x5a] },
  { id: 'mach-o-64', offset: 0, bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { id: 'mach-o-32', offset: 0, bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { id: 'mach-o-fat', offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { id: 'wasm', offset: 0, bytes: [0x00, 0x61, 0x73, 0x6d] },
  { id: 'java-class', offset: 0, bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { id: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { id: 'gzip', offset: 0, bytes: [0x1f, 0x8b] },
  { id: 'rar', offset: 0, bytes: [0x52, 0x61, 0x72, 0x21] },
  { id: '7z', offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf] },
  { id: 'pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { id: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { id: 'jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { id: 'sqlite', offset: 0, bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65] },
]

/** Hex rendering of a bounded byte prefix. */
function hexPrefix(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, MAGIC_BYTES), byte => byte.toString(16).padStart(2, '0')).join(' ')
}

/** Every container signature the prefix matches. */
function formatsOf(bytes: Uint8Array): string[] {
  return FORMAT_SIGNATURES
    .filter((signature) => {
      const end = signature.offset + signature.bytes.length
      if (end > bytes.length) return false
      return signature.bytes.every((value, index) => bytes[signature.offset + index] === value)
    })
    .map(signature => signature.id)
}

/** Shannon entropy of the byte distribution, in bits per byte. */
function entropyOf(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0
  const counts = new Uint32Array(256)
  for (const byte of bytes) counts[byte] = (counts[byte] ?? 0) + 1
  let entropy = 0
  for (const count of counts) {
    if (count === 0) continue
    const probability = count / bytes.length
    entropy -= probability * Math.log2(probability)
  }
  return Math.round(entropy * 1000) / 1000
}

/** Bounded printable ASCII runs in file order. */
function stringsOf(bytes: Uint8Array): { strings: string[]; truncated: boolean } {
  const strings: string[] = []
  let run = ''
  for (const byte of bytes) {
    const printable = byte >= 0x20 && byte <= 0x7e
    if (printable) {
      if (run.length < MAX_STRING_LENGTH) run += String.fromCharCode(byte)
      continue
    }
    if (run.length >= MIN_STRING_LENGTH) strings.push(run)
    run = ''
    if (strings.length >= MAX_STRINGS) return { strings, truncated: true }
  }
  if (run.length >= MIN_STRING_LENGTH && strings.length < MAX_STRINGS) strings.push(run)
  return { strings, truncated: strings.length >= MAX_STRINGS }
}

/**
 * Inspect one sample without executing it.
 * @param fs - composed filesystem.
 * @param rootPath - workspace directory.
 * @param path - caller-supplied workspace-relative sample path.
 * @param maxBytes - inclusive cap on the bytes this inventory reads.
 * @param signal - caller cancellation.
 * @returns the recognized format, hashes, entropy, and a bounded string preview.
 * @throws {DossierProblemError} when the sample is absent, outside the workspace, or over the cap.
 */
export async function inspectSample(
  fs: FileSystem,
  rootPath: string,
  path: string,
  maxBytes: number,
  signal: AbortSignal | undefined,
): Promise<SampleInspection> {
  const relative = normalizeRelativePath(path)
  const root = await fs.resolve(rootPath, resolveOptions(signal))
  const target = await resolveInside(fs, root, rootPath, relative, signal)
  const info = await fs.stat(target, signal)
  if (info?.type !== 'file') throw new DossierProblemError('workspace-missing', `no sample at ${relative}`)
  if (info.size !== undefined && info.size > maxBytes) {
    throw new DossierProblemError('unreadable', `${relative} is ${info.size} bytes; the inventory cap is ${maxBytes}`)
  }
  const bytes = await fs.readBytes(target, signal, maxBytes)
  const { strings, truncated } = stringsOf(bytes)
  return {
    path: relative,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    magic: hexPrefix(bytes),
    formats: formatsOf(bytes),
    entropy: entropyOf(bytes),
    strings,
    stringsTruncated: truncated,
  }
}
