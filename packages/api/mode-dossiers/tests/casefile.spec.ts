/** Case ledger validation, mutation, and report rendering. */

import { describe, expect, it } from 'vitest'
import {
  applyCaseMutation,
  caseSummaryOf,
  emptyCase,
  normalizeCase,
  parseCase,
  renderCaseReport,
  serializeCase,
  validateSlug,
} from '../src/casefile.ts'
import { DossierProblemError } from '../src/files.ts'

const NOW = '2026-10-24T00:00:00.000Z'

/** Build one parsed ledger the way `casefile.mjs init` writes it. */
function ledger(): ReturnType<typeof parseCase> {
  return parseCase(`${JSON.stringify(emptyCase('security', 'acme', 'Assess acme', NOW), null, 2)}\n`, 'case.json')
}

/** The reported code of a throw inside one operation. */
function codeOf(work: () => unknown): string {
  try {
    work()
  } catch (error: unknown) {
    if (error instanceof DossierProblemError) return error.code
    throw error
  }
  throw new Error('expected a dossier problem')
}

describe('case ledger parsing', () => {
  it('rejects text that is not JSON', () => {
    expect(codeOf(() => parseCase('{', 'case.json'))).toBe('corrupt')
  })

  it('rejects a document with no format version', () => {
    expect(codeOf(() => parseCase('{"kind":"security"}', 'case.json'))).toBe('corrupt')
  })

  it('rejects a format version this build does not read', () => {
    expect(codeOf(() => parseCase('{"version":2,"kind":"security","slug":"a"}', 'case.json'))).toBe('unsupported-version')
  })

  it('rejects a collection that is not an array', () => {
    expect(codeOf(() => parseCase('{"version":1,"kind":"security","slug":"a","targets":{}}', 'case.json'))).toBe('corrupt')
  })

  it('rejects a record without an id', () => {
    expect(codeOf(() => parseCase('{"version":1,"kind":"security","slug":"a","targets":[{}]}', 'case.json'))).toBe('corrupt')
  })

  it('keeps keys this build does not model', () => {
    const file = normalizeCase({
      version: 1, kind: 'security', slug: 'a', objective: '', createdAt: NOW, updatedAt: NOW,
      targets: [], evidence: [], findings: [], notes: [], mitigation: 'retest later',
    }, 'case.json')
    expect(file.extraKeys).toEqual(['mitigation'])
  })

  it('validates a case directory name', () => {
    expect(validateSlug('web-acme')).toBe('web-acme')
    expect(codeOf(() => validateSlug('../escape'))).toBe('corrupt')
    expect(codeOf(() => validateSlug('.'))).toBe('corrupt')
  })
})

describe('case mutation', () => {
  it('appends a target with a generated id and timestamps', () => {
    const file = ledger()
    const document = applyCaseMutation(file, {
      op: 'append', collection: 'targets', record: { value: '10.0.0.5', label: 'web01', note: '' },
    }, NOW)
    expect(document.targets).toHaveLength(1)
    expect(document.targets[0]).toMatchObject({ id: 'T-0001', value: '10.0.0.5', label: 'web01', addedAt: NOW })
    expect(document.updatedAt).toBe(NOW)
  })

  it('numbers a second record after the highest existing id', () => {
    const file = ledger()
    applyCaseMutation(file, { op: 'append', collection: 'targets', record: { value: 'a', label: '', note: '' } }, NOW)
    const document = applyCaseMutation(file, { op: 'append', collection: 'targets', record: { value: 'b', label: '', note: '' } }, NOW)
    expect(document.targets.map(target => target.id)).toEqual(['T-0001', 'T-0002'])
  })

  it('updates a record without dropping fields another writer added', () => {
    const file = ledger()
    applyCaseMutation(file, { op: 'append', collection: 'targets', record: { value: 'a', label: '', note: '' } }, NOW)
    const record = (file.raw.targets as Record<string, unknown>[])[0]
    if (record === undefined) throw new Error('fixture target missing')
    record.owner = 'recon'
    const document = applyCaseMutation(file, {
      op: 'update', collection: 'targets', id: 'T-0001', record: { value: 'b', label: 'web', note: 'n' },
    }, NOW)
    expect(document.targets[0]).toMatchObject({ value: 'b', label: 'web', note: 'n' })
    expect(record.owner).toBe('recon')
  })

  it('refuses a finding that cites evidence the ledger does not hold', () => {
    const file = ledger()
    expect(codeOf(() => applyCaseMutation(file, {
      op: 'append', collection: 'findings',
      record: { title: 'x', severity: 'high', target: '', cvss: '', evidence: ['E-0001'], note: '', status: 'open' },
    }, NOW))).toBe('corrupt')
  })

  it('normalizes the severity vocabulary', () => {
    const file = ledger()
    const document = applyCaseMutation(file, {
      op: 'append', collection: 'findings',
      record: { title: 'x', severity: 'HIGH', target: '', cvss: '', evidence: [], note: '', status: 'open' },
    }, NOW)
    expect(document.findings[0]?.severity).toBe('high')
  })

  it('resolves evidence ids on a finding', () => {
    const file = ledger()
    applyCaseMutation(file, { op: 'append', collection: 'evidence', record: { kind: 'http', ref: 'GET /api', note: '' } }, NOW)
    const document = applyCaseMutation(file, {
      op: 'append', collection: 'findings',
      record: { title: 'x', severity: 'high', target: '', cvss: '', evidence: ['E-0001'], note: '', status: 'open' },
    }, NOW)
    expect(document.findings[0]?.evidence).toEqual(['E-0001'])
  })

  it('deletes only the named record', () => {
    const file = ledger()
    applyCaseMutation(file, { op: 'append', collection: 'notes', record: { title: 'a', body: '' } }, NOW)
    applyCaseMutation(file, { op: 'append', collection: 'notes', record: { title: 'b', body: '' } }, NOW)
    const document = applyCaseMutation(file, { op: 'delete', collection: 'notes', id: 'N-0001' }, NOW)
    expect(document.notes.map(note => note.title)).toEqual(['b'])
  })

  it('refuses to delete a record that is not there', () => {
    const file = ledger()
    expect(codeOf(() => applyCaseMutation(file, { op: 'delete', collection: 'notes', id: 'N-0009' }, NOW))).toBe('corrupt')
  })

  it('sets the objective', () => {
    const file = ledger()
    expect(applyCaseMutation(file, { op: 'objective', objective: 'New objective' }, NOW).objective).toBe('New objective')
  })

  it('serializes unknown top-level keys back to disk', () => {
    const file = normalizeCase({ ...emptyCase('reverse', 'bin', '', NOW), analyst: 'me' }, 'case.json')
    applyCaseMutation(file, { op: 'objective', objective: 'Trace the parser' }, NOW)
    const text = serializeCase(file)
    expect(JSON.parse(text)).toMatchObject({ analyst: 'me', objective: 'Trace the parser', version: 1 })
  })
})

describe('case summary and report', () => {
  it('summarizes counts and extra keys', () => {
    const file = normalizeCase({ ...emptyCase('security', 'acme', 'Assess', NOW), review: true }, 'case.json')
    expect(caseSummaryOf(file, 'security')).toMatchObject({
      slug: 'acme', kind: 'security', objective: 'Assess', targets: 0, evidence: 0, findings: 0, notes: 0, extraKeys: ['review'],
    })
  })

  it('renders the report sections and escapes table cells', () => {
    const file = ledger()
    const document = applyCaseMutation(file, {
      op: 'append', collection: 'targets', record: { value: 'a|b', label: 'line\nbreak', note: '' },
    }, NOW)
    const markdown = renderCaseReport(document)
    expect(markdown).toContain('## Targets')
    expect(markdown).toContain('| T-0001 | `a\\|b` | line break |')
    expect(markdown).toContain('## Evidence')
  })
})
