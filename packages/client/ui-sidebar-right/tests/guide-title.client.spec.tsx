// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { GuideTitle } from '../src/client/tabs/guide/GuideTitle.tsx'

afterEach(cleanup)
it('updates the Start label from the current locale instead of a persisted tab title', () => {
  const props = (label: string) => ({ t: () => label, useTabInfo: () => ({ tab: { title: '开始' } }) }) as Parameters<typeof GuideTitle>[0]
  const view = render(<GuideTitle {...props('开始')} />)
  expect(screen.getByText('开始')).toBeTruthy()
  view.rerender(<GuideTitle {...props('Start')} />)
  expect(screen.queryByText('开始')).toBeNull()
  expect(screen.getByText('Start')).toBeTruthy()
})
