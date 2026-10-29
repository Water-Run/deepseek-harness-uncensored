/** Disposable legacy MCP server; every process and operation records in its isolated working directory. */
import { createInterface } from 'node:readline'
import { appendFileSync, writeFileSync } from 'node:fs'
appendFileSync('pids', `${process.pid}\n`)
process.stdin.once('end', () => process.exit(0))
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  const reply = result => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
  if (request.method === 'server/discover') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Legacy server' } }) + '\n')
  } else if (request.method === 'initialize') {
    reply({ protocolVersion: request.params.protocolVersion, capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'guarded-mcp-fixture', version: '1.0.0' } })
  } else if (request.method === 'tools/list') {
    reply({ tools: ['write_marker', 'wait_forever'].map(name => ({ name, annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: {} } })) })
  } else if (request.method === 'tools/call') {
    if (request.params.name === 'wait_forever') { writeFileSync('waiting', '1'); return }
    writeFileSync('called', 'executed')
    reply({ content: [{ type: 'text', text: 'executed' }] })
  } else if (request.method === 'resources/list') {
    reply({ resources: [{ uri: 'fixture://evidence', name: 'Evidence' }] })
  } else if (request.method === 'resources/read') {
    writeFileSync('read-resource', '1')
    reply({ contents: [{ uri: 'fixture://evidence', text: 'owned evidence' }] })
  } else reply({})
})
