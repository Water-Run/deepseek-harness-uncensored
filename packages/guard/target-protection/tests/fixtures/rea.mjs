/** Owned stdio peer; all side effects are inside the test-assigned working directory. */
import { createInterface } from 'node:readline'
import { writeFileSync, existsSync } from 'node:fs'
writeFileSync('started', String(process.pid))
if (existsSync('linger')) { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000) }
const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  if (existsSync('hold-startup')) return
  let result
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'guarded-rea-fixture', version: '1.0.0' } }
  else if (request.method === 'tools/list') result = { tools: ['write_marker', 'wait_forever'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) }
  else if (request.method === 'tools/call') {
    if (request.params.name === 'wait_forever') { writeFileSync('waiting', '1'); return }
    writeFileSync('called', 'executed')
    result = { content: [{ type: 'text', text: 'executed' }] }
  } else result = {}
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
})
