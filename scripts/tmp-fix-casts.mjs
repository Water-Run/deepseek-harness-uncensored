import { readFileSync, writeFileSync } from 'node:fs'

const patches = [
  ['packages/client/ui-settings-agent-loop/tests/card.client.spec.tsx', 'AgentLoopCardProps'],
  ['packages/client/ui-settings-memory/tests/source-status.client.spec.tsx', 'MemoryRowProps'],
  ['packages/client/ui-settings-shell/tests/card.client.spec.tsx', 'ShellCardProps'],
  ['packages/client/ui-settings-subagent/tests/card.client.spec.tsx', 'SubagentCardProps'],
  ['packages/client/ui-sidebar-documentpreview/tests/renderer-loading.client.spec.tsx', 'OfficeFontActionProps'],
  ['packages/experimental/client-ui-claude-code-mods/tests/band.client.spec.tsx', 'BandProps'],
]
for (const [file, type] of patches) {
  let text = readFileSync(file, 'utf8')
  const needle = ` as ${type}`
  if (!text.includes(needle)) {
    console.log(`${file}: cast ${type} not found`)
    continue
  }
  text = text.replace(needle, ` as unknown as ${type}`)
  writeFileSync(file, text)
  console.log(`${file}: cast relaxed`)
}

// Host side: the trajectory plugin reads the Session store through the host augmentation.
const trajectory = 'packages/client/ui-trajectory/src/index.ts'
let trajectoryText = readFileSync(trajectory, 'utf8')
if (!trajectoryText.includes("dsh-session/context")) {
  const index = trajectoryText.indexOf('import ')
  trajectoryText = `${trajectoryText.slice(0, index)}import type {} from '@deepseek-ai/dsh-session/context'\n${trajectoryText.slice(index)}`
  writeFileSync(trajectory, trajectoryText)
  console.log('trajectory host context imported')
}
