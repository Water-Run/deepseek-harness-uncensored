// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ReaOptions } from '@deepseek-ai/dsh-api-mode-dossiers/types'
import { ReaPanel } from '../src/client/ReaPanel.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const t = makeTranslate(en)
const defaults: ReaOptions = { enabled: false, nodePath: '/node', cliPath: '/rea.mjs',
  ghidraPath: '', javaHome: '', idaConfig: '', provider: 'auto',
  startupTimeoutMs: 60000, toolTimeoutMs: 180000, catalogPageSize: 20 }

it('keeps configuration explicit and searches the checked catalog', async () => {
  let options = defaults
  const operations = {
    load: vi.fn(async () => ({ options, revision: 1 })),
    save: vi.fn(async (next: ReaOptions) => { options = next }),
    probe: vi.fn(async () => ({ name: 'REA', version: '6.8.0', toolCount: 2, tools: ['open_binary', 'analyze_function'], engines: [] })),
  }
  render(<ReaPanel operations={operations} t={t} />)
  await screen.findByPlaceholderText(en['rea.nodePathHint'])
  await waitFor(() => { expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false') })
  expect(screen.getByText(en['rea.check']).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('switch'))
  fireEvent.click(screen.getByText(en.save))
  await waitFor(() => { expect(operations.save).toHaveBeenCalledOnce() })
  await waitFor(() => { expect(screen.getByText(en['rea.check']).hasAttribute('disabled')).toBe(false) })
  fireEvent.click(screen.getByText(en['rea.check']))
  await screen.findByText('REA 6.8.0')
  fireEvent.click(screen.getByText(en['rea.catalog']))
  fireEvent.change(screen.getByLabelText(en['rea.search']), { target: { value: 'binary' } })
  expect(screen.queryByText('analyze_function')).toBeNull()
  expect(screen.getByText('open_binary')).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText(en['rea.nodePathHint']), { target: { value: '/new-node' } })
  expect(screen.queryByText('REA 6.8.0')).toBeNull()
})

it('retains editable values when a save fails and aborts checks on unmount', async () => {
  const operations = {
    load: vi.fn(async (_signal: AbortSignal) => ({ options: { ...defaults, enabled: true }, revision: 1 })),
    save: vi.fn(async () => { throw new Error('settings conflict') }),
    probe: vi.fn(async () => ({ name: 'REA', version: '6.8.0', toolCount: 0, tools: [], engines: [] })),
  }
  const view = render(<ReaPanel operations={operations} t={t} />)
  const input = await screen.findByPlaceholderText(en['rea.nodePathHint'])
  fireEvent.change(input, { target: { value: '/changed' } })
  fireEvent.click(screen.getByText(en.save))
  expect((await screen.findByRole('alert')).textContent).toContain('settings conflict')
  expect((input as HTMLInputElement).value).toBe('/changed')
  view.unmount()
  expect(operations.load.mock.calls[0]?.[0]?.aborted).toBe(true)
})
