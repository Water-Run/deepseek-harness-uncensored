/** Regression cases for the local MCP declaration diagnostic. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkMcpSchema } from './check-mcp-schema.mjs'

const surrogate = '^[^\\uD800-\\uDFFF]*$'
const malformed = { pattern: '[' }

test('distinguishes the observed Messages rejection from invalid Unicode regex syntax', () => {
  const schema = { type: 'object', properties: { label: { allOf: [{ pattern: '^[^\\x00]*$' }, { pattern: surrogate }] } } }
  const original = structuredClone(schema)
  assert.deepEqual(checkMcpSchema(schema), {
    checked: 2, findings: [{ path: '/properties/label/allOf/1/pattern', reason: 'observed-deepseek-messages-rejection' }],
  })
  assert.deepEqual(schema, original)
  assert.deepEqual(checkMcpSchema({ type: 'object', patternProperties: { '[': { pattern: 1 } } }), {
    checked: 2, findings: [
      { path: '/patternProperties/[', reason: 'invalid-ecmascript-unicode-regex' },
      { path: '/patternProperties/[/pattern', reason: 'pattern-must-be-string' },
    ],
  })
})

test('inspects nested schemas while ignoring examples, annotations and literal property names', () => {
  const schema = {
    type: 'object',
    properties: { 'a~/b': { items: { if: malformed } }, pattern: { type: 'string' } },
    $defs: { note: { prefixItems: [malformed] } },
    dependencies: { note: ['pattern'] },
    patternProperties: { [surrogate]: true },
    examples: [malformed], default: malformed, const: malformed, enum: [malformed],
    'x-display': malformed, $ref: 'https://example.invalid/external',
  }
  const { checked, findings } = checkMcpSchema(schema)
  assert.equal(checked, 3)
  assert.deepEqual(findings.map(finding => finding.path).sort(), ['/$defs/note/prefixItems/0/pattern', '/properties/a~0~1b/items/if/pattern'])
  assert.deepEqual(checkMcpSchema({ type: 'object', properties: { label: { pattern: '^[a-z]+(?![\\s\\S])' } } }), { checked: 1, findings: [] })
})

test('requires a standalone MCP input schema', () => {
  for (const value of [null, [], {}, { type: 'string' }, { tools: [] }]) {
    assert.throws(() => checkMcpSchema(value), /inputSchema/u)
  }
})
