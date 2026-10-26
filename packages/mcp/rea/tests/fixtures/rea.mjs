/** Local protocol fixture: each child owns its target value. No network or external engines. */
import { createInterface } from 'node:readline'
import { writeFileSync } from 'node:fs'
const lines = createInterface({ input: process.stdin })
let target = ''
const tools = [
  { name: 'set_target', description: 'Select a sample', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  { name: 'read_target', description: 'Read current sample', inputSchema: { type: 'object', properties: {} } },
  { name: 'wait_forever', description: 'Wait until cancellation', inputSchema: { type: 'object', properties: {} } },
]
lines.on('line', line => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  let result
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'rea-fixture', version: '1.0.0' } }
  else if (request.method === 'tools/list') result = { tools }
  else if (request.method === 'tools/call') {
    if (request.params.name === 'wait_forever') { writeFileSync('wait-started', '1'); return }
    if (request.params.name === 'set_target') target = request.params.arguments.target
    result = { content: [{ type: 'text', text: target }] }
  } else result = {}
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
})
