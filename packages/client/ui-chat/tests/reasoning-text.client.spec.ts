import { describe, expect, it } from 'vitest'
import { reasoningText } from '../src/client/reasoning-text.ts'

describe('reasoning display text', () => {
  it.each([
    '',
    'Ordinary reasoning',
    '普通思考正文',
    '\n  Original text  \n',
    '<note>Original text</note>',
    '<Signature>ordinary text</Signature>',
    '<signature-extra>ordinary text</signature-extra>',
    'Quoted <signature>text</signature>',
  ])('preserves ordinary reasoning %j', (text) => {
    expect(reasoningText(text)).toBe(text)
  })

  it.each(['<', '<s', '<signature', '<signature>', '<signature>metadata', '<signature>metadata</sig'])
  ('waits for a complete leading signature before showing streamed reasoning %j', (text) => {
    expect(reasoningText(text)).toBe('')
  })

  it.each([
    ['<signature>metadata</signature>', ''],
    ['<signature>metadata</signature>分析正文', '分析正文'],
    ['<signature>metadata</signature>\n\r\n\n正文\n', '正文\n'],
    ['<signature>metadata</signature>  正文', '  正文'],
    ['<signature>metadata</signature>\r正文', '\r正文'],
    ['<signature>metadata</signature><signature>quoted</signature>', '<signature>quoted</signature>'],
  ])('omits only the leading metadata envelope in %j', (input, visible) => {
    expect(reasoningText(input)).toBe(visible)
  })
})
