// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AboutDialog } from '../src/client/AboutDialog.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('checks releases only while open and cancels each dismissed request', async () => {
  vi.stubEnv('DSH_CLIENT_FORK_VERSION', '0.1.0')
  const signals: AbortSignal[] = []
  const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init.signal!
    signals.push(signal)
    signal.addEventListener('abort', () => { reject(new DOMException('Dismissed', 'AbortError')) }, { once: true })
  }))
  vi.stubGlobal('fetch', fetcher)
  const props = { t: makeTranslate(en), close: vi.fn() }
  const view = render(<AboutDialog {...props} open={false} />)
  expect(fetcher).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
  view.rerender(<AboutDialog {...props} open />)
  await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(1) })
  view.rerender(<AboutDialog {...props} open={false} />)
  expect(signals[0]!.aborted).toBe(true)
  view.rerender(<AboutDialog {...props} open />)
  await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(2) })
  expect(signals[1]!.aborted).toBe(false)
  view.unmount()
  expect(signals[1]!.aborted).toBe(true)
})

it.each([en, zh])('shows the maintainer and separates product and foundation versions', async (locale) => {
  vi.stubEnv('DSH_CLIENT_FORK_VERSION', '0.1.0')
  vi.stubEnv('DSH_CLIENT_UPSTREAM_VERSION', '0.2.1-rc.3')
  vi.stubEnv('DSH_CLIENT_COMMIT_HASH', 'abc1234')
  vi.stubEnv('DSH_CLIENT_BUILD_TIME', '2026-10-26T01:00:00.000Z')
  vi.stubEnv('DSH_CLIENT_REA_VERSION', '6.9.0')
  vi.stubEnv('DSH_CLIENT_REA_COMMIT', 'd74549e495c58eb4a560279fd9f05508401ea0a0')
  vi.stubEnv('DSH_CLIENT_REA_DATE', '2026-11-12T08:58:30Z')
  vi.stubEnv('DSH_CLIENT_REA_REPOSITORY', 'https://github.com/morluto/rea')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
  render(<AboutDialog t={makeTranslate(locale)} close={vi.fn()} />)
  expect(screen.getByRole('link', { name: 'WaterRun' }).getAttribute('href')).toBe('https://github.com/Water-Run')
  expect(screen.getByText(locale.aboutBasedOn.replace('{version}', '0.2.1-rc.3'))).toBeTruthy()
  expect(screen.getByText('0.1.0')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'REA 6.9.0' }).getAttribute('href')).toBe('https://github.com/morluto/rea')
  expect(screen.getByRole('link', { name: 'd74549e495c5' }).getAttribute('href')).toBe('https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0')
  expect(screen.getByText(locale.aboutReaEngines)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'abc1234' }).getAttribute('href')).toMatch(/\/commit\/abc1234$/u)
  expect(await screen.findByText(locale.aboutNoRelease)).toBeTruthy()
})
