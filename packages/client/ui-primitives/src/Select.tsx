/** Controlled choice menu using the application's overlay and keyboard behavior. */
import { useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { Menu } from './Menu.tsx'
import { IconChevronDownOutlineRegular } from './icons/index.tsx'
import css from './Select.module.css'

/**
 * Render a localized selection control without a native select popup.
 * @param props - Selected value, options, accessible label and change callback.
 * @returns A button and a viewport-bounded menu; selection restores button focus.
 */
export function Select<Value extends string>({ value, options, onChange, label, id, disabled = false, invalid, className }: {
  value: Value
  options: readonly { value: Value; label: string; disabled?: boolean }[]
  onChange: (value: Value) => void
  label: string
  id?: string
  disabled?: boolean
  invalid?: boolean
  className?: string | undefined
}) {
  const [open, setOpen] = useState(false)
  if (open && disabled) setOpen(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const selectedLabelId = useId()
  const selected = options.find(option => option.value === value)
  return <Menu open={open && !disabled} portal autoFocus selectedId={value} listClassName={css.options}
    items={options.map(option => ({ ...option, id: option.value }))}
    onClose={() => { setOpen(false) }}
    onSelect={(id) => {
      const option = options.find(candidate => candidate.value === id)
      if (option === undefined || option.disabled) return
      setOpen(false)
      trigger.current?.focus({ preventScroll: true })
      onChange(option.value)
    }}
    anchor={<button ref={trigger} id={id} type="button" value={value} aria-label={label} aria-invalid={invalid}
      aria-haspopup="menu" aria-expanded={open && !disabled} aria-describedby={selectedLabelId} disabled={disabled}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        setOpen(true)
      }}
      className={clsx(css.trigger, className)} onClick={() => { setOpen(current => !current) }}>
      <span id={selectedLabelId} className={css.label}>{selected?.label ?? value}</span>
      <IconChevronDownOutlineRegular className={css.chevron} size={14} />
    </button>} />
}
