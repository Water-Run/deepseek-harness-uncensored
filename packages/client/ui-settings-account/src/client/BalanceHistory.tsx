/** Sample inspection uses the original observations, independently of curve downsampling. */
import { useId, useMemo, useState } from 'react'
import type { PointerEvent } from 'react'
import { Big } from 'big.js'
import { balanceChart, nearestBalanceSample, type BalanceChartSample } from './balance-chart.ts'
import { formatBalance } from './formatBalance.ts'
import css from './BalanceView.module.css'

function besidePointer(pointer: number, span: number, size: number): number {
  const gap = 8
  const end = Math.max(0, span - size)
  const after = pointer + gap
  const before = pointer - size - gap
  return Math.min(end, Math.max(0, after <= end ? after : before))
}

/**
 * Inspect sampled balances by pointer, touch, or arrow keys.
 * @param props - Ordered observations, currency symbol and localized labels.
 * @returns The chart and its selected observation, or null without samples.
 */
export function BalanceHistory({ samples, symbol, label, help, formatValue, stepIncreases = false, compressionHint }: {
  samples: readonly BalanceChartSample[]
  symbol: '¥' | '$'
  label: string
  help: string
  formatValue?: (value: number) => string
  stepIncreases?: boolean
  compressionHint?: string
}) {
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const id = useId()
  const compressFlat = compressionHint !== undefined
  const geometry = useMemo(() => balanceChart(samples, { stepIncreases, compressFlat }), [samples, stepIncreases, compressFlat])
  const first = samples[0], last = samples.at(-1), range = geometry.range
  if (first === undefined || last === undefined || range === undefined) return null
  const format = formatValue ?? ((value: number): string => formatBalance(new Big(value).toString(), symbol))
  const selected = Math.min(samples.length - 1, Math.max(0, hover?.index ?? cursor ?? samples.length - 1))
  const sample = samples[selected] ?? last
  const active = hover !== null || focused
  const ratio = geometry.positions[selected] ?? 0
  const x = 52 + ratio * 252
  const y = range.low === range.high ? 55 : 98 - (sample.value - range.low) * 86 / (range.high - range.low)
  const compressed = Boolean(geometry.compressed)
  const inspect = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1)
    const index = nearestBalanceSample(geometry.positions, (x * 264 - 6) / 252)
    setHover({ index, x, y })
    if (event.pointerType !== 'mouse') setCursor(index)
  }
  const placeTip = (element: HTMLDivElement | null): void => {
    const plot = element?.parentElement
    if (element === null || plot == null) return
    // The localized date and amount determine the bubble's actual size.
    element.style.left = hover === null ? '' : `${besidePointer(hover.x * plot.clientWidth, plot.clientWidth, element.offsetWidth)}px`
    element.style.top = hover === null ? '' : `${besidePointer(hover.y * plot.clientHeight, plot.clientHeight, element.offsetHeight)}px`
  }
  return <div className={css.history}>
    <div className={css.plot}>
      <div className={css.axisLabels} data-flat={range.low === range.high} aria-hidden="true">
        <span>{format(range.high)}</span>{range.low !== range.high && <span>{format(range.low)}</span>}
      </div>
      <div className={css.plotControl} role="slider" tabIndex={0} aria-label={label} aria-describedby={compressed ? `${id} ${id}-compressed` : id}
        aria-valuemin={0} aria-valuemax={samples.length - 1} aria-valuenow={selected}
        aria-valuetext={`${new Date(sample.time).toLocaleString()} · ${format(sample.value)}`}
        onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={() => { setHover(null) }} onPointerCancel={() => { setHover(null) }}
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
          {geometry.kind === 'series' && (geometry.path === undefined
            ? <polyline points={geometry.points} className={css.line} />
            : <><path d={geometry.path} className={css.line} /><path d={geometry.increases} className={`${css.line} ${css.increase}`} /></>)}
          {compressed && <path d={geometry.compressed} className={`${css.line} ${css.compressed}`} />}
          {active && <path d={`M${x} 8V102`} className={css.crosshair} />}
        </svg>
        {(active || geometry.kind === 'single') && <span className={css.samplePoint} style={{ left: `${(x - 46) / 264 * 100}%`, top: `${y / 110 * 100}%` }} />}
        {active && <div className={css.sampleTip} data-follow-pointer={hover !== null} ref={placeTip} role="status">
          <time dateTime={new Date(sample.time).toISOString()}>{new Date(sample.time).toLocaleString()}</time>
          <strong>{format(sample.value)}</strong>
        </div>}
      </div>
    </div>
    <div className={css.timeRange}><time dateTime={new Date(first.time).toISOString()}>{new Date(first.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><time dateTime={new Date(last.time).toISOString()}>{new Date(last.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
    {compressed && <p id={`${id}-compressed`} className={css.compressionHint}>{compressionHint}</p>}
    <p id={id} className={css.chartHelp}>{help}</p>
  </div>
}
