/** Smooth balance changes without moving the currency mark or inventing a failed refresh. */
import { useEffect, useRef, useState } from 'react'
import { amountNumber, amountPrefix, formatRolling } from './rolling-amount.ts'

/**
 * Animate from the previous successful amount to the next one.
 * A currency change, a sub-cent placeholder, or reduced motion snaps.
 * A newer target replaces an in-flight animation from the value on screen.
 * @param props.text - Formatted currency text from the last successful observation.
 * @returns The visible amount.
 */
export function RollingAmount({ text }: { text: string }) {
  const [shown, setShown] = useState(text)
  const shownRef = useRef(text)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const previous = shownRef.current
    const from = amountNumber(previous)
    const to = amountNumber(text)
    if (media.matches || from === undefined || to === undefined || amountPrefix(previous) !== amountPrefix(text) || from === to) {
      shownRef.current = text
      setShown(text)
      return
    }
    let frame = 0
    const changed = (): void => {
      if (!media.matches) return
      cancelAnimationFrame(frame)
      shownRef.current = text
      setShown(text)
    }
    media.addEventListener('change', changed)
    const started = performance.now()
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - started) / 450)
      const eased = 1 - (1 - progress) ** 3
      const next = progress === 1 ? text : formatRolling(text, from + (to - from) * eased)
      shownRef.current = next
      setShown(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', changed) }
  }, [text])
  return <span>{shown}</span>
}
