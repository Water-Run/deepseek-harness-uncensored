/** Historical compositions run under the shipped profile without adding choices to the four-mode UI. */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { launchWebScaffold } from './scaffold.ts'

it('restores the Minimal tool set with native persistent shell state and durable image reading', async () => {
  const scaffold = await launchWebScaffold()
  try {
    expect((await scaffold.ctx.agentPresets.remoteExportList()).presets.map(row => row.id))
      .toEqual(['standard', 'security', 'reverse', 'writing'])
    const handle = await scaffold.ctx.agents.create({ sessionId: SessionId('legacy-minimal-native'),
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'minimal' },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash-vision-exp' },
      setup: async (ctx) => { await scaffold.ctx.agentPresets.mount(ctx, 'minimal') },
    })
    try {
      const shell = process.platform === 'win32' ? 'pwsh' : 'bash'
      expect(scaffold.ctx.tools.schemas(handle.agent).map(tool => tool.name).sort()).toEqual([shell, 'read_image', 'working_directory'].sort())
      const stateDir = join(scaffold.workspaceCwd, 'persistent-state')
      await mkdir(stateDir)
      const command = process.platform === 'win32'
        ? `Set-Location -LiteralPath '${stateDir.replaceAll("'", "''")}'; $env:DSHU_LEGACY_STATE = 'PERSISTED'`
        : `cd '${stateDir.replaceAll("'", "'\\''")}' && export DSHU_LEGACY_STATE=PERSISTED`
      const execute = (id: string, command: string) => scaffold.ctx.tools.execute({ agent: handle.agent,
        callId: ToolCallId(id), name: shell, arguments: { command }, signal: new AbortController().signal })
      expect((await execute('legacy-state-setup', command)).isError).toBe(false)
      const result = await execute('legacy-state-read', process.platform === 'win32'
        ? 'Write-Output "$env:DSHU_LEGACY_STATE|$((Get-Location).Path)"'
        : 'printf "%s|%s\\n" "$DSHU_LEGACY_STATE" "$PWD"')
      expect(result.isError).toBe(false)
      expect(result.content.filter(block => block.type === 'text').map(block => block.text).join('')).toContain(`PERSISTED|${stateDir}`)
      const imagePath = join(scaffold.workspaceCwd, 'red.png')
      await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))
      const image = await scaffold.ctx.tools.execute({ agent: handle.agent, callId: ToolCallId('legacy-image'), name: 'read_image',
        arguments: { file_path: imagePath }, signal: new AbortController().signal })
      expect(image.isError, image.content.filter(block => block.type === 'text').map(block => block.text).join('')).toBe(false)
      expect(image.content.some(block => block.type === 'image')).toBe(true)
    } finally { await handle.dispose() }
  } finally { await scaffold.close() }
})
