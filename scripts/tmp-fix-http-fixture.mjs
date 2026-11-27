import { readFileSync, writeFileSync } from 'node:fs'

const path = 'packages/mcp/mcp-client/tests/http-fixture.ts'
let text = readFileSync(path, 'utf8')
text = text.replace(
  'export async function startHttpMcpFixture(options: { rejectToolCalls?: boolean } = {}): Promise<HttpMcpFixture> {',
  'export async function startHttpMcpFixture(options: { rejectToolCalls?: boolean; authorizationFailure?: boolean } = {}): Promise<HttpMcpFixture> {',
)
text = text.replace(
  '    authorization.push(request.headers.authorization)\n    // The adapter excludes explicit undefined on Node\'s optional HTTP fields.',
  `    authorization.push(request.headers.authorization)
    if (options.authorizationFailure) {
      response.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer error="invalid_token"' })
      response.end(JSON.stringify({ error: 'invalid_token' }))
      return
    }
    // The adapter excludes explicit undefined on Node's optional HTTP fields.`,
)
writeFileSync(path, text)
console.log('fixture supports authorization failures')
