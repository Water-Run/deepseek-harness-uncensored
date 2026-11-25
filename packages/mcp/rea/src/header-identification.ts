/**
 * Model-visible file identity from supplied header bytes. This operation has no filesystem or process access.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import { ToolArgsError, defineTool } from '@deepseek-ai/dsh-tools'
import { readMachoHeaderPrefixFacts } from 'rea-agents/dist/domain/apple/machoContainer.js'
import { machoArchitectureName } from 'rea-agents/dist/domain/apple/machoCpuIdentity.js'
import { readElfFixedHeader } from 'rea-agents/dist/domain/elfFixedHeader.js'
import { readPeCoffHeader } from 'rea-agents/dist/domain/peCoffHeader.js'
import { decodePeMachine } from 'rea-agents/dist/domain/peMachine.js'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from './index.ts'

function headerFromMessage(text: string): string {
  const blocks: string[][] = []
  let current: string[] | undefined
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (/^[a-f\d \t]+$/iu.test(trimmed) || /^[a-f\d]+:\s/iu.test(trimmed) || (trimmed === '*' && current)) {
      if (!current) { current = []; blocks.push(current) }
      current.push(trimmed)
    } else {
      current = undefined
    }
  }
  const [header] = blocks
  if (!header || blocks.length !== 1) throw new ToolArgsError(['Paste one hex or xxd dump on its own lines in the current message.'])
  if (!header.some(line => line.includes(':'))) return header.join(' ')

  let hex = ''
  for (const line of header) {
    const [, offset = '', contents = ''] = /^([a-f\d]{8,16}): (.+)$/iu.exec(line) ?? []
    if (Number.parseInt(offset, 16) !== hex.length / 2) {
      throw new ToolArgsError(['Use consecutive xxd rows starting at offset zero.'])
    }
    const [column = ''] = contents.split(/ {2,}/u, 1)
    const groups = column.split(' ')
    if (!groups.every(group => /^(?:[a-f\d]{2}){1,2}$/iu.test(group))) {
      throw new ToolArgsError(['Paste standard xxd output or use xxd -g 1.'])
    }
    hex += groups.join('')
    if (hex.length > 8192) throw new ToolArgsError(['Supply up to 4096 hexadecimal bytes.'])
  }
  return hex
}

function identify(input: string) {
  if (input.length > 12_288) throw new ToolArgsError(['Supply up to 4096 hexadecimal bytes.'])
  const hex = input.replace(/\s/gu, '')
  if (hex.length === 0 || hex.length > 8192 || hex.length % 2 || /[^a-f\d]/iu.test(hex)) {
    throw new ToolArgsError(['Supply complete hexadecimal byte pairs, optionally separated by whitespace.'])
  }
  const bytes = Buffer.from(hex, 'hex')
  if (hex.toLowerCase().startsWith('7f454c46')) {
    const header = readElfFixedHeader(bytes)
    if (!header.ok) throw new ToolArgsError([header.error])
    return { format: 'ELF', machine: header.value.machine, architecture: header.value.architecture }
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    if (bytes.length < 64) throw new ToolArgsError(['The DOS header is incomplete.'])
    const offset = bytes.readUInt32LE(60)
    if (offset < 64 || offset + 4 > bytes.length) throw new ToolArgsError(['The prefix does not contain the PE signature.'])
    if (bytes.readUInt32LE(offset) === 0x4550) {
      const header = readPeCoffHeader(bytes.subarray(offset + 4))
      if (!header.ok) throw new ToolArgsError([header.error.message])
      const machine = decodePeMachine(header.value.machine)
      return { format: 'PE', machine: header.value.machine, architecture: machine && !machine.nativeOsOverride ? machine.architecture : null }
    }
  }
  const macho = readMachoHeaderPrefixFacts(bytes)
  if (macho.format !== null) {
    if (macho.identity === null) throw new ToolArgsError(['Supply the first 12 bytes of the Mach-O header to identify its CPU.'])
    const { cpuType, cpuSubtype } = macho.identity
    const name = machoArchitectureName(cpuType, cpuSubtype)
    return { format: 'Mach-O', machine: cpuType, architecture: name.startsWith('cpu-') ? null : name }
  }
  return { format: null, machine: null, architecture: null }
}

/** Register REA's fixed-header reader in the first model request while the integration is enabled.
 * @param ctx - Scope owning the tools and REA preference.
 */
export function registerHeaderIdentification(ctx: Context): void {
  ctx.inject(['systemPrompt'], (scope) => {
    scope.effect(() => scope.systemPrompt.section({
      name: 'rea:file-identification',
      order: scope.systemPrompt.getSectionOrder('TOOL_READ'),
      text: ({ scope: agent }) => scope.rea.options.enabled && scope.tools.get('rea_identify_header', agent) !== undefined
        ? 'Use rea_identify_header for format or CPU questions about a pasted executable header. Ask for its hex or xxd prefix if the message has no bytes.'
        : '',
    }))
  })
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rea_identify_header',
    description: 'Identify the file format and declared CPU architecture of ELF, Windows PE, or single-architecture Mach-O from a hex prefix or standard xxd output in the current user message.',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute(_args, { agent }) {
      if (!ctx.rea.options.enabled) throw new ToolArgsError(['REA is disabled in settings.'])
      const message = agent?.session.deriveMessages().findLast(item => item.role === 'user' && item.source.kind === 'user')
      if (!message) throw new ToolArgsError(['A current user message with a hex dump is required.'])
      const text = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n\n')
      return Promise.resolve(identify(headerFromMessage(text)))
    },
  }), { when: () => ctx.rea.options.enabled }))
}
