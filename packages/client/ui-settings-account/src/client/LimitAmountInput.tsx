/** Number entry with application-styled increment controls. */
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, Input, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SpendingView.module.css'

/**
 * Edit a CNY limit without native spinner styling or width overflow.
 * @param props - Controlled text, localized labels and validation state.
 * @returns A number input with keyboard and pointer increment controls.
 */
export function LimitAmountInput({ id, value, label, increase, decrease, disabled, invalid, descriptionId, onChange }: {
  id: string
  value: string
  label: string
  increase: string
  decrease: string
  disabled: boolean
  invalid: boolean
  descriptionId?: string | undefined
  onChange: (value: string) => void
}) {
  const number = Number(value)
  const step = (direction: number): void => {
    const next = Math.max(0.000001, Math.min(1_000_000, Math.round(((Number.isFinite(number) ? number : 0) + direction) * 1e6) / 1e6))
    onChange(String(next))
  }
  return <div className={css.amountGroup}>
    <Input id={id} className={css.amountInput ?? ''} icon={<span aria-hidden="true">¥</span>} type="number" min={0.000001} max={1_000_000} step={1}
      value={value} aria-label={label} aria-invalid={invalid} aria-describedby={descriptionId} disabled={disabled}
      onChange={(event) => { onChange(event.target.value) }} />
    <div className={css.steps}>
      <Tooltip label={increase}><button type="button" aria-label={increase} aria-controls={id} disabled={disabled || number >= 1_000_000}
        onMouseDown={(event) => { event.preventDefault() }} onClick={() => { step(1) }}>
        <IconChevronUpOutlineRegular size={12} /></button></Tooltip>
      <Tooltip label={decrease}><button type="button" aria-label={decrease} aria-controls={id} disabled={disabled || (value !== '' && number <= 0.000001)}
        onMouseDown={(event) => { event.preventDefault() }} onClick={() => { step(-1) }}>
        <IconChevronDownOutlineRegular size={12} /></button></Tooltip>
    </div>
  </div>
}
