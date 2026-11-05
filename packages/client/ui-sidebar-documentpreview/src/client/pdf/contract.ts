/** Reusable PDF reader assembly and its package-local viewport position. @module */
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { DocumentBodyOwner, DocumentPreviewProps } from '../contract.ts'
import type { ZoomViewportProps } from '../ZoomViewport.tsx'
import type { PdfStore } from './store.ts'
import type {} from './locales.ts'

/** Document inputs and the existing bound tab reader consumed by the PDF Factory. */
export type PdfReaderInputProps = DocumentBodyOwner & Pick<DocumentPreviewProps, 'useTabInfo'>

/** Plain callbacks and style data supplied by the reader definition. */
export interface PdfBodyInjected {
  /**
   * Retain viewing preferences until the tab record ends.
   * @param tabId - owning tab.
   * @param signal - tab-record lifetime, not body visibility.
   */
  readonly retainTab: (tabId: TabId, signal: AbortSignal) => void
  /** Main-bundle class implementing fit-width and fixed-size surfaces. */
  readonly zoomSurfaceClass: string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotFactoryMap {
    /** PDF reader with a caller-selected viewport, shared by PDF and converted Office documents. */
    'sidebar.document.pdf.reader': {
      scope: 'root'
      props: PdfReaderInputProps
      store: PdfStore
      inject: PdfBodyInjected
      locale: 'sidebarPdf'
      slots: {
        viewport: { scope: 'root'; props: ZoomViewportProps }
      }
    }
  }
}

/** Framework-derived PDF reader props, including local component selection. */
export type PdfBodyProps = FactoryComponentPropsOf<'sidebar.document.pdf.reader'>
