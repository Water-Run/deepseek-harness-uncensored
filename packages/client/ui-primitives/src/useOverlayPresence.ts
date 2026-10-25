/** Briefly retains dismissed overlay paint after its interaction and focus ownership ends. */
import { useEffect, useState } from 'react'

/** Matches the exit duration of Menu and Modal styles. */
const EXIT_MS = 120

/**
 * Keep an overlay mounted for its exit fade; reopening cancels pending removal.
 * @param open - Whether the overlay owns input and focus.
 * @returns Whether its visual tree is still present. Closed trees must be inert and aria-hidden.
 */
export function useOverlayPresence(open: boolean): boolean {
  const [retained, setRetained] = useState(open)
  useEffect(() => {
    if (open) { setRetained(true); return }
    if (!retained) return
    if (typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setRetained(false); return }
    const timer = window.setTimeout(() => { setRetained(false) }, EXIT_MS)
    return () => { window.clearTimeout(timer) }
  }, [open, retained])
  return open || retained
}
