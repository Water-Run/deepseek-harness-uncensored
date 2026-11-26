/** Offline check of regex constraints in a single MCP inputSchema. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const surrogateExclusion = '^[^\\uD800-\\uDFFF]*$'
const schemaMaps = new Set(['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas', 'dependencies'])
const schemaLists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const singleSchemas = new Set(['additionalItems', 'additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'not', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties'])
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const pointer = (path, part) => path + '/' + String(part).replaceAll('~', '~0').replaceAll('/', '~1')

/**
 * Inspect declared schema locations without following references, evaluating input, or rewriting constraints.
 * @param {object} schema A tools/list entry's inputSchema.
 * @returns {{checked: number, findings: Array<{path: string, reason: string}>}} Counts and JSON Pointers relative to the schema.
 */
export function checkMcpSchema(schema) {
  if (!object(schema) || schema.type !== 'object') throw new Error('Expected one MCP inputSchema with root type "object".')
  const findings = []
  let checked = 0
  function inspect(pattern, path, isValueConstraint) {
    checked++
    if (typeof pattern !== 'string') {
      findings.push({ path, reason: 'pattern-must-be-string' })
      return
    }
    try {
      new RegExp(pattern, 'u')
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      findings.push({ path, reason: 'invalid-ecmascript-unicode-regex' })
      return
    }
    if (isValueConstraint && pattern === surrogateExclusion) findings.push({ path, reason: 'observed-deepseek-messages-rejection' })
  }
  const pending = [[schema, '']]
  while (pending.length) {
    const [current, path] = pending.pop()
    if (!object(current)) continue
    for (const [key, value] of Object.entries(current)) {
      const location = pointer(path, key)
      if (key === 'pattern') inspect(value, location, true)
      else if (schemaMaps.has(key) && object(value)) {
        for (const [name, child] of Object.entries(value)) {
          const childPath = pointer(location, name)
          if (key === 'patternProperties') inspect(name, childPath, false)
          pending.push([child, childPath])
        }
      } else if ((schemaLists.has(key) || key === 'items') && Array.isArray(value)) {
        value.forEach((child, index) => pending.push([child, pointer(location, index)]))
      } else if (singleSchemas.has(key) || key === 'items') pending.push([value, location])
    }
  }
  return { checked, findings }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [file, ...extra] = process.argv.slice(2)
    if (!file || extra.length) throw new Error('Usage: node check-mcp-schema.mjs <input-schema.json>')
    const bytes = await readFile(file, 'utf8')
    let schema
    try {
      schema = JSON.parse(bytes.replace(/^\uFEFF/u, ''))
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      throw new Error('The schema file must contain valid JSON.')
    }
    const report = checkMcpSchema(schema)
    console.log(JSON.stringify(report))
    process.exitCode = report.findings.length ? 1 : 0
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
