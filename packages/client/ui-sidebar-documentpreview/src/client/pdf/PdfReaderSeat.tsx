/** Bridge explicit document inputs and the bound tab reader into the PDF Factory. @module */
import type { ReactNode } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { ZoomViewport } from '../ZoomViewport.tsx'
import type { PdfReaderInputProps } from './contract.ts'

const PDF_VIEWPORT = { viewport: ZoomViewport }

/** Only document inputs and the framework's rendering channel cross into the reader. */
export type PdfReaderSeatProps = PdfReaderInputProps & PropsRenderFactories

/**
 * Supply document inputs and the main-bundle viewport through the Factory's component channel.
 * @param props - document owner data and framework-provided rendering capabilities.
 * @returns One PDF reader occurrence.
 */
export function PdfReaderSeat({
  addResource, setResources, resourceAddress, content, wrap, scrollportRef, useTabInfo, renderFactorySlot,
}: PdfReaderSeatProps): ReactNode {
  return renderFactorySlot('sidebar.document.pdf.reader', {
    addResource, setResources, resourceAddress, content, wrap, scrollportRef, useTabInfo,
  }, { slots: PDF_VIEWPORT })
}
