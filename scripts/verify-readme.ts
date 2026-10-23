/** Validate the fork's single public documentation entry. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Check the README's length and repository-relative links.
 * @param markdown - Public README content.
 * @param root - Repository root used to resolve local links.
 * @returns Human-readable failures, empty when the document is valid.
 */
export function readmeErrors(markdown: string, root: string): string[] {
  const errors: string[] = []
  if (markdown.trim() === '') errors.push('README.md must not be empty')
  if (markdown.split('\n').length > 120) errors.push('README.md must stay within 120 lines')
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/gu)) {
    const target = (match[1] ?? '').split('#')[0] ?? ''
    if (target === '' || /^https:\/\//u.test(target)) continue
    if (!existsSync(resolve(root, target))) errors.push(`README.md: missing link target ${target}`)
  }
  return errors
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const errors = readmeErrors(readFileSync(resolve(root, 'README.md'), 'utf8'), root)
  if (errors.length > 0) throw new Error(errors.join('\n'))
  console.log('README.md: links and length passed')
}
