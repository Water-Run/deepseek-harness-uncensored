/** Shared settings rows with localized copy and a supplied control or choice menu. */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular } from './icons/index.tsx'
import { Menu } from './Menu.tsx'
import css from './PreferenceRow.module.css'

/** Full row props for a row whose control the caller supplies. */
export interface PreferenceControlRowProps {
  /** Row title. */
  title: string
  /** Supporting copy under the title. */
  description?: string | undefined
  /** Text announced under the description as an error or status line. */
  feedback?: string | undefined
  /** Announces the description itself as an error. */
  descriptionRole?: 'alert' | undefined
  /** The control shown on the right of the row. */
  children: ReactNode
}

/**
 * Render the row shell every Settings preference shares: the label block on
 * the left, the control on the right, and the hairline separator between rows.
 * @param props - row copy and the control.
 * @returns the settings row.
 */
export function PreferenceControlRow({ title, description, feedback, descriptionRole, children }: PreferenceControlRowProps) {
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{title}</div>
        {description === undefined ? null : <div className={css.desc} role={descriptionRole}>{description}</div>}
        {feedback === undefined ? null : <div role="alert" className={css.feedback}>{feedback}</div>}
      </div>
      <div className={css.control}>{children}</div>
    </div>
  )
}

/** Full row props. */
export interface PreferenceRowProps {
  /** Row title. */
  title: string
  /** Supporting copy under the title. */
  description?: string | undefined
  /** Text announced under the description as an error or status line. */
  feedback?: string | undefined
  /** Announces the description itself as an error. */
  descriptionRole?: 'alert' | undefined
  /** Identifier of the selected option. */
  value: string
  /** Label shown on the selector. */
  selectedLabel: string
  /** Choices the menu offers. */
  options: readonly { id: string; label: string }[]
  /** Apply a chosen option. */
  onSelect: (value: string) => void
  /** Block the selector while the owner cannot accept a change. */
  disabled?: boolean
  /** Accessible name of the selector; the selected label names it by default. */
  selectorLabel?: string
}

/**
 * Render a preference row and its menu; selection restores focus before publishing the new value.
 * @param props - row copy, selected value, choices, and the mutation callback.
 * @returns the settings row.
 */
export function PreferenceRow({
  title, description, feedback, descriptionRole, value, selectedLabel, options, onSelect, disabled = false, selectorLabel,
}: PreferenceRowProps) {
  const [open, setOpen] = useState(false)
  const selectorRef = useRef<HTMLButtonElement>(null)
  // A row that stops accepting changes closes its menu with the disabled selector.
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  const selectOption = (id: string): void => {
    selectorRef.current?.focus({ preventScroll: true })
    setOpen(false)
    onSelect(id)
  }
  const selector = (
    <button
      ref={selectorRef}
      type="button"
      className={css.selector}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={selectorLabel}
      disabled={disabled}
      onClick={() => { setOpen(current => !current) }}
    >
      {selectedLabel}
      <IconChevronDownOutlineRegular className={css.chevron} />
    </button>
  )

  return (
    <PreferenceControlRow title={title} description={description} feedback={feedback} descriptionRole={descriptionRole}>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={options}
        selectedId={value}
        onSelect={selectOption}
        align="end"
        portal
        anchor={selector}
      />
    </PreferenceControlRow>
  )
}
