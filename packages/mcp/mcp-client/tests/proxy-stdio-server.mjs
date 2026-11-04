/** Fixture exposing a stateful tool whose HTTP request uses the child environment. */
import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

const target = process.argv[2]
const server = new McpServer({ name: 'proxy-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
let count = 0
server.registerTool('inspect', { inputSchema: z.object({}) }, async () => {
  const response = await fetch(target, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`Fixture received HTTP ${response.status}`)
  return { content: [{ type: 'text', text: `${await response.text()}:${++count}` }] }
})
await server.connect(new StdioServerTransport())
