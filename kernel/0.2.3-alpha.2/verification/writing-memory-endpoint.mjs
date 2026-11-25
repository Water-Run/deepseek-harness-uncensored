/** Loopback Messages fixture for the installed writing-memory acceptance procedure. */
import { appendFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const [directory] = process.argv.slice(2)
if (!directory) throw new Error('Pass an empty directory for the port and request receipts.')
const trace = join(directory, 'provider.jsonl')
const oldFact = 'The North Quay lantern uses BRAMBLE-71 glass.'

function reply(body) {
  const text = body.messages.flatMap(({ content }) =>
    typeof content === 'string' ? [content] : content.map(block => block.text ?? ''),
  ).join('\n')
  if (text.includes('durable memories from the attributed conversation')) {
    const memories = text.includes('STORE-QUAY')
      ? [{ type: 'writing-setting', title: 'North Quay lantern', topic: 'North Quay lantern glass', content: oldFact }]
      : []
    return { answer: JSON.stringify({ memories }), receipt: { kind: 'extract', count: memories.length } }
  }
  if (text.includes('\n\nDraft:\n')) return { answer: '', receipt: { kind: 'prediction' } }
  const scenario = [...text.matchAll(/STORE-QUAY|QUERY-QUAY-(?:ONE|TWO|OFF|COLD|OTHER)/gu)].at(-1)?.[0]
  if (!scenario) return { answer: 'North Quay notebook', receipt: { kind: 'other' } }
  const old = text.includes('BRAMBLE-71')
  const updated = text.includes('COBALT-28')
  const glass = updated ? 'COBALT-28' : old ? 'BRAMBLE-71' : 'NO MATCH'
  const hasMemoryTools = (body.tools ?? []).some(tool => /memory_(?:write|search)$/u.test(tool.name))
  return {
    answer: scenario === 'STORE-QUAY' ? 'The writing note is ready.' : scenario + ' ' + glass,
    receipt: { kind: 'turn', scenario, old, updated, hasMemoryTools },
  }
}

function stream(res, model, answer) {
  const events = [
    { type: 'message_start', message: { id: randomUUID(), type: 'message', role: 'assistant', model, content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: answer } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 6 } },
    { type: 'message_stop' },
  ]
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(events.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''))
}

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.split('?')[0].endsWith('/messages')) {
    res.writeHead(404).end()
    return
  }
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const { answer, receipt } = reply(body)
    appendFileSync(trace, JSON.stringify(receipt) + '\n')
    stream(res, body.model, answer)
  } catch (error) {
    console.error(error.message)
    res.writeHead(500).end()
  }
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  writeFileSync(join(directory, 'port.txt'), String(port), { flag: 'wx' })
  console.log('http://127.0.0.1:' + port)
})
