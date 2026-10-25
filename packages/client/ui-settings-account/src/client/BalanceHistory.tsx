/** Sample inspection uses the original observations, independently of curve downsampling. */
import { useId, useState } from 'react'
import type { PointerEvent } from 'react'
import { Big } from 'big.js'
import { balanceChart, nearestBalanceSample, type BalanceChartSample } from './balance-chart.ts'
import { formatBalance } from './formatBalance.ts'
import css from './BalanceView.module.css'

/**
 * Inspect sampled balances by pointer, touch, or arrow keys.
 * @param props - Ordered observations, currency symbol and localized labels.
 * @returns The chart and its selected observation, or null without samples.
 */
export function BalanceHistory({ samples, symbol, label, help, formatValue }: {
  samples: readonly BalanceChartSample[]
  symbol: '¥' | '$'
  label: string
  help: string
  formatValue?: (value: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const id = useId()
  const geometry = balanceChart(samples)
  const first = samples[0], last = samples.at(-1), range = geometry.range
  if (first === undefined || last === undefined || range === undefined) return null
  const format = formatValue ?? ((value: number): string => formatBalance(new Big(value).toString(), symbol))
  const selected = Math.min(samples.length - 1, Math.max(0, hover ?? cursor ?? samples.length - 1))
  const sample = samples[selected] ?? last
  const active = hover !== null || focused
  const ratio = first.time === last.time
    ? selected / Math.max(1, samples.length - 1) : (sample.time - first.time) / (last.time - first.time)
  const x = 52 + ratio * 252
  const y = range.low === range.high ? 55 : 98 - (sample.value - range.low) * 86 / (range.high - range.low)
  const inspect = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = ((event.clientX - rect.left) / Math.max(rect.width, 1) * 264 - 6) / 252
    const index = nearestBalanceSample(samples, fraction)
    setHover(index)
    if (event.pointerType !== 'mouse') setCursor(index)
  }
  return <div className={css.history}>
    <div className={css.plot}>
      <div className={css.axisLabels} data-flat={range.low === range.high} aria-hidden="true">
        <span>{format(range.high)}</span>{range.low !== range.high && <span>{format(range.low)}</span>}
      </div>
      <div className={css.plotControl} role="slider" tabIndex={0} aria-label={label} aria-describedby={id}
        aria-valuemin={0} aria-valuemax={samples.length - 1} aria-valuenow={selected}
        aria-valuetext={`${new Date(sample.time).toLocaleString()} · ${format(sample.value)}`}
        onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={() => { setHover(null) }}
        onFocus={() => { setFocused(true) }} onBlur={() => { setFocused(false); setHover(null) }}
        onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? samples.length - 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? selected - 1
              : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? selected + 1 : undefined
          if (next === undefined) return
          event.preventDefault(); setHover(null); setCursor(Math.max(0, Math.min(samples.length - 1, next)))
        }}>
        <svg className={css.chart} viewBox="46 0 264 110" preserveAspectRatio="none" aria-hidden="true">
          <path d="M52 12H304 M52 55H304 M52 98H304" className={css.axis} />
          {geometry.kind === 'series' && <polyline points={geometry.points} className={css.line} />}
          {active && <path d={`M${x} 8V102`} className={css.crosshair} />}
        </svg>
        {(active || geometry.kind === 'single') && <span className={css.samplePoint} style={{ left: `${(x - 46) / 264 * 100}%`, top: `${y / 110 * 100}%` }} />}
        {active && <div className={css.sampleTip} role="status"><time dateTime={new Date(sample.time).toISOString()}>{new Date(sample.time).toLocaleString()}</time><strong>{format(sample.value)}</strong></div>}
      </div>
    </div>
    <div className={css.timeRange}><time dateTime={new Date(first.time).toISOString()}>{new Date(first.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><time dateTime={new Date(last.time).toISOString()}>{new Date(last.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
    <p id={id} className={css.chartHelp}>{help}</p>
  </div>
}
