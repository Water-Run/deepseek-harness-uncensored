// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AsideTitle } from '../src/client/asides/AsidePanel.tsx'

afterEach(cleanup)
it('updates the side-question label when the locale changes with an existing tab', () => {
  const props = (label: string) => ({ t: () => label, useTabInfo: () => ({ tab: { title: '旁问' } }) }) as Parameters<typeof AsideTitle>[0]
  const view = render(<AsideTitle {...props('旁问')} />)
  expect(screen.getByText('旁问')).toBeTruthy()
  view.rerender(<AsideTitle {...props('Side question')} />)
  expect(screen.queryByText('旁问')).toBeNull()
  expect(screen.getByText('Side question')).toBeTruthy()
})
