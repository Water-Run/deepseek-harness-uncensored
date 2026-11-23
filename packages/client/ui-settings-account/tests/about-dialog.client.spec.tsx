// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AboutDialog } from '../src/client/AboutDialog.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([en, zh])('retains a rate limit across closing and reopens manual checking after its deadline', async (locale) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
  vi.stubEnv('DSH_CLIENT_FORK_VERSION', '2026.11.16.3')
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'retry-after': '60' } }))
    .mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetcher)
  const props = { t: makeTranslate(locale), close: vi.fn() }
  let view: ReturnType<typeof render>
  await act(async () => { view = render(<AboutDialog {...props} />) })
  const button = screen.getByRole<HTMLButtonElement>('button', { name: locale.aboutCheck })
  expect(button.disabled).toBe(true)
  expect(screen.getByRole('status').textContent).toContain(locale.aboutRateLimitedUntil.split('{time}')[0])
  fireEvent.click(button)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async () => { view.rerender(<AboutDialog {...props} open={false} />) })
  await act(async () => { view.rerender(<AboutDialog {...props} open />) })
  expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(screen.getByRole<HTMLButtonElement>('button', { name: locale.aboutCheck }).disabled).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: locale.aboutCheck })) })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(screen.getByText(locale.aboutNoRelease)).toBeTruthy()
})

it.each([en, zh])('distinguishes a forbidden check from a proven rate limit', async (locale) => {
  vi.stubEnv('DSH_CLIENT_FORK_VERSION', '2026.11.16.3')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))
  render(<AboutDialog t={makeTranslate(locale)} close={vi.fn()} />)
  expect(await screen.findByText(locale.aboutForbidden)).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: locale.aboutCheck }).disabled).toBe(false)
})

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
  vi.stubEnv('DSH_CLIENT_UPSTREAM_VERSION', '0.2.2-rc.5')
  vi.stubEnv('DSH_CLIENT_UPSTREAM_COMMIT', '9c2670d3bce5275e0d1610272958121af87787bb')
  vi.stubEnv('DSH_CLIENT_COMMIT_HASH', 'abc1234')
  vi.stubEnv('DSH_CLIENT_BUILD_TIME', '2026-10-26T01:00:00.000Z')
  vi.stubEnv('DSH_CLIENT_REA_VERSION', '6.9.0')
  vi.stubEnv('DSH_CLIENT_REA_COMMIT', 'd74549e495c58eb4a560279fd9f05508401ea0a0')
  vi.stubEnv('DSH_CLIENT_REA_DATE', '2026-11-12T08:58:30Z')
  vi.stubEnv('DSH_CLIENT_REA_REPOSITORY', 'https://github.com/morluto/rea')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
  render(<AboutDialog t={makeTranslate(locale)} close={vi.fn()} />)
  expect(screen.getByRole('link', { name: 'WaterRun' }).getAttribute('href')).toBe('https://github.com/Water-Run')
  expect(screen.getByRole('link', { name: locale.aboutBasedOn.replace('{version}', '0.2.2-rc.5') }).getAttribute('href'))
    .toBe('https://github.com/deepseek-ai/deepseek-harness/commit/9c2670d3bce5275e0d1610272958121af87787bb')
  expect(screen.getByRole('link', { name: locale.licenseName }).getAttribute('href')).toMatch(/\/blob\/abc1234\/LICENSE$/u)
  expect(screen.getByRole('link', { name: locale.aboutThirdParty }).getAttribute('href')).toMatch(/\/blob\/abc1234\/THIRD_PARTY_NOTICES\.md$/u)
  expect(screen.getByText('0.1.0')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'REA 6.9.0' }).getAttribute('href')).toBe('https://github.com/morluto/rea')
  expect(screen.getByRole('link', { name: 'd74549e495c5' }).getAttribute('href')).toBe('https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0')
  expect(screen.getByText(locale.aboutReaEngines)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'abc1234' }).getAttribute('href')).toMatch(/\/commit\/abc1234$/u)
  expect(await screen.findByText(locale.aboutNoRelease)).toBeTruthy()
})

it('fades in instead of resizing the 940px card', async () => {
  vi.stubEnv('DSH_CLIENT_FORK_VERSION', '0.1.0')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
  render(<AboutDialog t={makeTranslate(en)} close={vi.fn()} />)
  expect(screen.getByRole('dialog').getAttribute('data-enter')).toBe('fade')
  expect(await screen.findByText(en.aboutNoRelease)).toBeTruthy()
})
