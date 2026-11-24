/** Sample inspection uses the original observations, independently of curve downsampling. */
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Big } from 'big.js'
import { BALANCE_DASH_ARRAY, balanceChart, nearestBalanceSample, retainedBalanceSample, type BalanceChartSample } from './balance-chart.ts'
import { formatBalance, formatBalanceDetail } from './formatBalance.ts'
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
 * Pointer bubbles refit to layout changes without changing the selected observation.
 * The mounted bubble keeps one set of layout observers while the pointer moves.
 * @param props - Ordered observations, currency symbol and localized labels.
 * @returns The chart and its selected observation, or null without samples.
 */
export function BalanceHistory({ samples, symbol, label, help, formatValue, stepIncreases = false, dashHint }: {
  samples: readonly BalanceChartSample[]
  symbol: '¥' | '$'
  label: string
  help: string
  formatValue?: (value: number) => string
  stepIncreases?: boolean
  dashHint?: string
}) {
  const [hover, setHover] = useState<BalanceChartSample | null>(null)
  const [cursor, setCursor] = useState<BalanceChartSample | null>(null)
  const [focused, setFocused] = useState(false)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const tipPlacement = useRef<{ place(): void; dispose(): void } | null>(null)
  const attachTip = useCallback((element: HTMLDivElement | null): void => {
    tipPlacement.current?.dispose()
    tipPlacement.current = null
    const plot = element?.parentElement
    if (element === null || plot == null) return
    let attached = true
    const place = (): void => {
      if (!attached) return
      const point = pointer.current
      if (point === null) {
        element.style.left = ''
        element.style.top = ''
        return
      }
      const rect = plot.getBoundingClientRect()
      const width = plot.clientWidth, height = plot.clientHeight
      const tipWidth = element.offsetWidth, tipHeight = element.offsetHeight
      // Localized text determines the bubble size; layout changes retain the selected sample.
      const x = (point.x - rect.left) * width / Math.max(rect.width, 1)
      const y = (point.y - rect.top) * height / Math.max(rect.height, 1)
      element.style.left = `${besidePointer(x, width, tipWidth)}px`
      element.style.top = `${besidePointer(y, height, tipHeight)}px`
    }
    place()
    const win = plot.ownerDocument.defaultView
    const Observer = win?.ResizeObserver
    const observer = Observer === undefined ? undefined : new Observer(place)
    observer?.observe(plot)
    observer?.observe(element)
    win?.addEventListener('resize', place)
    win?.addEventListener('scroll', place, true)
    tipPlacement.current = { place, dispose() {
      attached = false
      observer?.disconnect()
      win?.removeEventListener('resize', place)
      win?.removeEventListener('scroll', place, true)
    } }
  }, [])
  const id = useId()
  const dashes = dashHint !== undefined
  const [size, setSize] = useState({ plotWidth: 264, plotHeight: 110 })
  const plotObserver = useRef<ResizeObserver | null>(null)
  const observePlot = useCallback((plot: HTMLDivElement | null) => {
    plotObserver.current?.disconnect()
    plotObserver.current = null
    if (plot === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setSize({ plotWidth: entry.contentRect.width, plotHeight: entry.contentRect.height })
      }
    })
    plotObserver.current = observer
    observer.observe(plot)
  }, [])
  const geometry = useMemo(() => balanceChart(samples, { stepIncreases, dashes, ...size }), [samples, stepIncreases, dashes, size])
  const first = samples[0], last = samples.at(-1), range = geometry.range
  if (first === undefined || last === undefined || range === undefined) return null
  const axisDigits = range.low === range.high ? 2 : Math.max(2, Math.min(8, 1 - Math.floor(Math.log10(range.high - range.low))))
  const format = formatValue ?? ((value: number): string => formatBalanceDetail(new Big(value).toFixed(axisDigits), symbol))
  const inspected = hover ?? cursor
  const selected = inspected === null ? samples.length - 1 : retainedBalanceSample(samples, inspected)
  const sample = samples[selected] ?? last
  const exact = new Big(sample.exactValue ?? sample.value).toString()
  const detail = formatBalanceDetail(exact, symbol)
  // The bubble leads with the two-decimal display; extra digits appear only when they differ.
  const sampleAmount = formatValue?.(sample.value) ?? formatBalance(exact, symbol)
  const precise = formatValue === undefined && detail !== sampleAmount ? detail : undefined
  const active = hover !== null || focused
  const ratio = geometry.positions[selected] ?? 0
  const x = 52 + ratio * 252
  const y = range.low === range.high ? 55 : 98 - (sample.value - range.low) * 86 / (range.high - range.low)
  const dashed = Boolean(geometry.compressed) || Boolean(geometry.gaps)

  const inspect = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
    const index = nearestBalanceSample(geometry.positions, (x * 264 - 6) / 252)
    const sample = samples[index] ?? last
    pointer.current = { x: event.clientX, y: event.clientY }
    tipPlacement.current?.place()
    setHover(sample)
    if (event.pointerType !== 'mouse') setCursor(sample)
  }
  const clearHover = (): void => {
    pointer.current = null
    tipPlacement.current?.place()
    setHover(null)
  }
  return <div className={css.history}>
    <div className={css.plot}>
      <div className={css.axisLabels} data-flat={range.low === range.high} aria-hidden="true">
        <span>{format(range.high)}</span>{range.low !== range.high && <span>{format(range.low)}</span>}
      </div>
      <div ref={dashes ? observePlot : undefined} className={css.plotControl} role="slider" tabIndex={0} aria-label={label} aria-describedby={dashed ? `${id} ${id}-dashed` : id}
        aria-valuemin={0} aria-valuemax={samples.length - 1} aria-valuenow={selected}
        aria-valuetext={`${new Date(sample.time).toLocaleString()} · ${precise ?? sampleAmount}`}
        onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={clearHover} onPointerCancel={clearHover}
        onFocus={() => { setFocused(true) }} onBlur={() => { setFocused(false); clearHover() }}
        onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? samples.length - 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? selected - 1
              : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? selected + 1 : undefined
          if (next === undefined) return
          event.preventDefault()
          clearHover()
          setCursor(samples[Math.max(0, Math.min(samples.length - 1, next))] ?? last)
        }}>
        <svg className={css.chart} viewBox="46 0 264 110" preserveAspectRatio="none" aria-hidden="true">
          <path d="M52 12H304 M52 55H304 M52 98H304" className={css.axis} />
          {geometry.kind === 'series' && (geometry.path === undefined
            ? <polyline points={geometry.points} className={css.line} />
            : <><path d={geometry.path} className={css.line} /><path d={geometry.increases} className={`${css.line} ${css.increase}`} /></>)}
          {geometry.compressed && <path d={geometry.compressed} className={css.line} strokeDasharray={BALANCE_DASH_ARRAY} />}
          {geometry.gaps && <path d={geometry.gaps} className={css.line} strokeDasharray={BALANCE_DASH_ARRAY} />}
          {active && <path d={`M${x} 8V102`} className={css.crosshair} />}
        </svg>
        {(active || geometry.kind === 'single') && <span className={css.samplePoint} style={{ left: `${(x - 46) / 264 * 100}%`, top: `${y / 110 * 100}%` }} />}
        {active && <div className={css.sampleTip} data-follow-pointer={hover !== null} ref={attachTip} role="status">
          <time dateTime={new Date(sample.time).toISOString()}>{new Date(sample.time).toLocaleString()}</time>
          <strong>{sampleAmount}</strong>
          {precise !== undefined && <span className={css.sampleExact}>{precise}</span>}
        </div>}
      </div>
    </div>
    <div className={css.timeRange}><time dateTime={new Date(first.time).toISOString()}>{new Date(first.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><time dateTime={new Date(last.time).toISOString()}>{new Date(last.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
    {dashed && <p id={`${id}-dashed`} className={css.dashHint}>{dashHint}</p>}
    <p id={id} className={css.chartHelp}>{help}</p>
  </div>
}
