/**
 * Model-visible file identity from supplied header bytes. This operation has no filesystem or process access.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis'
import { ToolArgsError, defineTool } from '@deepseek-ai/dsh-tools'
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
    if (trimmed && /^[a-f\d \t]+$/iu.test(trimmed)) {
      if (!current) { current = []; blocks.push(current) }
      current.push(trimmed)
    } else {
      current = undefined
    }
  }
  const [header] = blocks
  if (!header || blocks.length !== 1) throw new ToolArgsError(['Include one hex dump on its own lines in the current message.'])
  return header.join(' ')
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
        ? 'For questions about a pasted executable header’s file format or CPU architecture, use rea_identify_header. It reads the original bytes from the current user message.'
        : '',
    }))
  })
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'rea_identify_header',
    description: 'Identify the file format and declared CPU architecture of pasted ELF or Windows PE header bytes. Use for file identification and architecture questions when the conversation includes the hex prefix.',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(_args, { agent }) {
      if (!ctx.rea.options.enabled) throw new ToolArgsError(['REA is disabled in settings.'])
      const session = agent?.session
      if (session) {
        for (let i = session.surface.nodes.length - 1; i >= 0; i--) {
          const seq = session.surface.nodes[i]
          const event = seq === undefined ? undefined : session.eventAt(seq)
          if (event?.type !== 'user/message' || event.data.source.kind !== 'user') continue
          const userText = event.data.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n\n')
          return identify(headerFromMessage(userText))
        }
      }
      throw new ToolArgsError(['A current user message with a hex dump is required.'])
    },
  }), { when: () => ctx.rea.options.enabled }))
}
