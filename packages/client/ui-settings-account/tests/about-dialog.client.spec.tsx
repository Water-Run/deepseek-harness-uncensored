// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { AboutDialog } from '../src/client/AboutDialog.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([en, zh])('shows the maintainer and separates product and foundation versions', async (locale) => {
  vi.stubEnv('DSH_CLIENT_FORK_VERSION', '0.1.0')
  vi.stubEnv('DSH_CLIENT_UPSTREAM_VERSION', '0.2.1-rc.3')
  vi.stubEnv('DSH_CLIENT_COMMIT_HASH', 'abc1234')
  vi.stubEnv('DSH_CLIENT_BUILD_TIME', '2026-10-26T01:00:00.000Z')
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
  render(<AboutDialog t={makeTranslate(locale)} close={vi.fn()} />)
  expect(screen.getByRole('link', { name: 'WaterRun' }).getAttribute('href')).toBe('https://github.com/Water-Run')
  expect(screen.getByText(locale.aboutBasedOn.replace('{version}', '0.2.1-rc.3'))).toBeTruthy()
  expect(screen.getByText('0.1.0')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'abc1234' }).getAttribute('href')).toMatch(/\/commit\/abc1234$/u)
  expect(await screen.findByText(locale.aboutNoRelease)).toBeTruthy()
})
