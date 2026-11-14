// @vitest-environment jsdom
/** Real Factory composition keeps the viewport in its declared component channel. */
import { useEffect, useState } from 'react'
import { act, fireEvent, waitFor } from '@testing-library/react'
import { expect, it, onTestFinished, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { DocumentPreviewRegistry } from '../src/client/registry.ts'
import { apply } from '../src/client/pdf/index.ts'
import { PdfReaderSeat } from '../src/client/pdf/PdfReaderSeat.tsx'
import type { PdfBodyProps } from '../src/client/pdf/contract.ts'
import type { PdfReaderInputProps } from '../src/client/index.ts'
import type { PdfView } from '../src/client/pdf/store.ts'
import { harness } from './fixtures.client.ts'

vi.mock('../src/client/pdf/pdf.tsx', () => ({ PdfBody: ProbeReader }))

const INITIAL_VIEW: PdfView = { page: 1 }

function missingViewport(): never { throw new Error('The reader lost its viewport selection') }

function ProbeReader(props: PdfBodyProps) {
  const Viewport = props.useFactorySlot('viewport', missingViewport)
  const { tab } = props.useTabInfo()
  const view = props.useStore(state => state.byTab[tab.id] ?? INITIAL_VIEW)
  useEffect(() => { props.retainTab(tab.id, tab.signal) }, [props.retainTab, tab.id, tab.signal])
  expect(props).not.toHaveProperty('ZoomViewport')
  return <Viewport preference={view.zoom ?? { kind: 'fit-width' }} intrinsicWidth={100} horizontalInset={24}
    labels={{ controls: 'Zoom controls', menu: 'Zoom', out: 'Out', into: 'In', fitWidth: 'Fit width', value: value => String(value) }}
    signal={tab.signal} scrollportRef={props.scrollportRef} onPreference={(value) => { props.actions.zoom(tab.id, value) }}>
    <div data-pdf-reader={tab.id}>
      <button onClick={() => { props.actions.page(tab.id, view.page + 1) }}>Next {tab.id}</button>
      <span data-reader-page={tab.id}>{view.page}</span>
      <input aria-label={`Local ${tab.id}`} defaultValue="" />
    </div>
  </Viewport>
}

it('retains independent tab views and stable local viewport content through updates and remounts', async () => {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  runtime.ctx.provide('documentPreviews', new DocumentPreviewRegistry())
  await runtime.mount({ inject: ['slots', 'locale', 'documentPreviews'], apply })
  const original = harness().props()
  const first = new AbortController(), second = new AbortController()
  onTestFinished(() => { first.abort(); second.abort() })
  const input = (id: TabId, controller: AbortController): PdfReaderInputProps => ({
    addResource: vi.fn(), setResources: vi.fn(),
    resourceAddress: `dsh-resource://file/session/documents/${id}.pdf`,
    content: { kind: 'bytes', data: new Uint8Array([1]) }, wrap: false, scrollportRef: vi.fn(),
    useTabInfo: () => {
      const info = original.useTabInfo()
      return { ...info, tab: { ...info.tab, id, signal: controller.signal } }
    },
  })
  let a = input('first' as TabId, first), b = input('second' as TabId, second), visible = true
  let update = () => {}
  await runtime.root.declare({}, function Root({ renderFactorySlot }: PropsRenderFactories) {
    const [, render] = useState(0)
    update = () => { render(value => value + 1) }
    return visible ? <>
      <PdfReaderSeat {...a} renderFactorySlot={renderFactorySlot} />
      <PdfReaderSeat {...b} renderFactorySlot={renderFactorySlot} />
    </> : null
  })
  const view = runtime.renderRoot()
  await waitFor(() => { expect(view.getByRole('button', { name: 'Next first' })).toBeTruthy() })
  fireEvent.click(view.getByRole('button', { name: 'Next first' }))
  await waitFor(() => { expect(view.container.querySelector('[data-reader-page="first"]')?.textContent).toBe('2') })
  expect(view.container.querySelector('[data-reader-page="second"]')?.textContent).toBe('1')
  fireEvent.change(view.getByRole('textbox', { name: 'Local first' }), { target: { value: 'retained' } })
  a = { ...a, content: { kind: 'bytes', data: new Uint8Array([2]) } }
  b = { ...b, wrap: true }
  act(() => { update() })
  expect((view.getByRole('textbox', { name: 'Local first' }) as HTMLInputElement).value).toBe('retained')
  expect(view.container.querySelector('[data-reader-page="first"]')?.textContent).toBe('2')
  act(() => { visible = false; update() })
  expect(view.container.querySelector('[data-pdf-reader]')).toBeNull()
  act(() => { visible = true; update() })
  await waitFor(() => { expect(view.container.querySelector('[data-reader-page="first"]')?.textContent).toBe('2') })
  act(() => { first.abort() })
  expect(view.container.querySelector('[data-reader-page="first"]')?.textContent).toBe('1')
  expect(view.container.querySelector('[data-reader-page="second"]')?.textContent).toBe('1')
})
