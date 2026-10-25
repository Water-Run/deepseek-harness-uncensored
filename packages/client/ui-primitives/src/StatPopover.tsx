/** Click-open statistics panel using the shared placement, dismissal and menu material. */
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition } from './useAnchoredPosition.ts'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'
import { MenuSurface } from './MenuSurface.tsx'
import { useOverlayPresence } from './useOverlayPresence.ts'
import { useModalLayer } from './useModalLayer.ts'
import css from './StatPopover.module.css'

/**
 * Render a footer reading with a viewport-fitting details panel.
 * @param props - Localized reading, panel title, decorative icon and details.
 * @returns Clickable reading and its keyboard-accessible details.
 */
export function StatPopover({ label, title, icon, children }: { label: string; title: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const present = useOverlayPresence(open)
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const position = useAnchoredPosition({ open: present, anchorRef: root, panelRef: panel, side: 'top', gap: 8, margin: 12 })
  useDismissOnOutsidePointer(root, open, setOpen, panel)
  useModalLayer(panel, open && position !== null, () => { setOpen(false) })
  return <span ref={root} className={css.root}>
    <button ref={trigger} type="button" className={css.trigger} aria-label={`${title}: ${label}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setOpen(value => !value) }}>{icon}<span>{label}</span></button>
    {present && createPortal(<MenuSurface ref={panel} tabIndex={-1} className={css.panel} role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label={title}
      {...(open ? {} : { inert: '' })} aria-hidden={!open || undefined} data-exiting={!open || undefined}
      style={position ?? { visibility: 'hidden', left: 0, top: 0 }}>
      <h3 className={css.title}>{title}</h3>{children}
    </MenuSurface>, document.body)}
  </span>
}
