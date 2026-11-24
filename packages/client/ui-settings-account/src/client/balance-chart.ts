/** Geometry for the local balance sample curve. Sampling and rates stay elsewhere. */

/** One plotted observation. */
export interface BalanceChartSample {
  readonly time: number
  readonly value: number
  /** Original decimal amount retained for inspection; geometry uses value. */
  readonly exactValue?: string
}

/** Drawable curve and original sample positions on its displayed time axis. */
export interface BalanceChartGeometry {
  readonly kind: 'empty' | 'single' | 'series'
  readonly points: string
  readonly positions: readonly number[]
  /** Solid runs and vertical jumps when balance increases are drawn as discrete events. */
  readonly path?: string
  readonly increases?: string
  /** Horizontal dashed connectors replacing compressed flat runs. */
  readonly compressed?: string
  /** Dashed connectors spanning intervals the samples do not cover. */
  readonly gaps?: string
  readonly dot?: { readonly x: number; readonly y: number }
  /** Observed value bounds; the vertical axis labels them. */
  readonly range?: { readonly low: number; readonly high: number }
}

/** Plot area: a left gutter carries the vertical axis labels. */
const LEFT = 52
const WIDTH = 252
const TOP = 12
const BOTTOM = 98
const MAX_POINTS = 120
const FLAT_THRESHOLD_MS = 30 * 60_000
/** Sample intervals above this multiple of the usual cadence carry no observation. */
const GAP_FACTOR = 3
const MIN_GAP_MS = 5 * 60_000
const DASH_PX = 5
const GAP_PX = 4
/** SVG dash pattern in CSS pixels for non-scaling balance connectors. */
export const BALANCE_DASH_ARRAY = `${DASH_PX} ${GAP_PX}`

interface FlatRun { start: number; end: number; duration: number }

function atIndex<T>(items: readonly T[], index: number): T {
  const value = items[index]
  if (value === undefined) throw new RangeError(`Balance chart index ${index} is out of range`)
  return value
}

function flatRuns(samples: readonly BalanceChartSample[]): FlatRun[] {
  const runs: FlatRun[] = []
  let start = 0
  for (let end = 1; end <= samples.length; end += 1) {
    const first = atIndex(samples, start)
    if (samples[end]?.value === first.value) continue
    const duration = atIndex(samples, end - 1).time - first.time
    if (duration >= FLAT_THRESHOLD_MS) runs.push({ start, end: end - 1, duration })
    start = end
  }
  return runs
}

/**
 * Interval above which a connector means the samples do not cover it.
 * The usual cadence comes from the lower quartile of positive intervals, so an
 * outage elsewhere in the history cannot raise its own threshold.
 * @param samples - Observations in time order.
 * @returns Milliseconds above which consecutive observations count as separated.
 */
function gapThreshold(samples: readonly BalanceChartSample[]): number {
  const intervals: number[] = []
  for (let index = 1; index < samples.length; index += 1) {
    const interval = atIndex(samples, index).time - atIndex(samples, index - 1).time
    if (interval > 0) intervals.push(interval)
  }
  if (intervals.length === 0) return Number.POSITIVE_INFINITY
  intervals.sort((left, right) => left - right)
  return Math.max(MIN_GAP_MS, GAP_FACTOR * atIndex(intervals, Math.floor((intervals.length - 1) / 4)))
}

/**
 * Count the observation gaps ending at or before each observation.
 * @param samples - Observations in time order.
 * @param threshold - Interval above which consecutive observations count as separated.
 * @returns One running total per observation, so a drawn pair spans a gap when its totals differ.
 */
function gapEnds(samples: readonly BalanceChartSample[], threshold: number): number[] {
  const counts = [0]
  for (let index = 1; index < samples.length; index += 1) {
    const interval = atIndex(samples, index).time - atIndex(samples, index - 1).time
    counts.push(atIndex(counts, index - 1) + (interval > threshold ? 1 : 0))
  }
  return counts
}

function timeAxis(samples: readonly BalanceChartSample[], compress: boolean) {
  const start = atIndex(samples, 0).time
  const span = atIndex(samples, samples.length - 1).time - start
  const candidates = compress ? flatRuns(samples) : []
  const active = span - candidates.reduce((total, run) => total + run.duration, 0)
  // Together the compressed runs occupy at most a fifth of the remaining axis.
  const cap = active / (4 * Math.max(1, candidates.length))
  const runs = active > 0 ? candidates.filter(run => run.duration > cap) : []
  const displayed = span - runs.reduce((total, run) => total + run.duration - cap, 0)
  let runIndex = 0
  let removed = 0
  const positions = samples.map((sample, index) => {
    let run = runs[runIndex]
    if (run !== undefined && index > run.end) {
      removed += run.duration - cap
      run = runs[++runIndex]
    }
    const offset = sample.time - start - removed
    if (run !== undefined && index >= run.start) {
      const elapsed = sample.time - atIndex(samples, run.start).time
      return (offset - elapsed + elapsed / run.duration * cap) / displayed
    }
    return displayed === 0 ? index / Math.max(1, samples.length - 1) : offset / displayed
  })
  return { positions, runs }
}

/**
 * Project samples into the fixed balance chart view box.
 * @param samples - Observations for one currency, in time order.
 * @param options - Draw discrete increases and, with `dashes`, mark shortened unchanged runs and unobserved intervals.
 * @returns Empty, one dot, or a downsampled curve with positions for every original observation.
 */
export function balanceChart(
  samples: readonly BalanceChartSample[],
  options: { stepIncreases?: boolean; dashes?: boolean; plotWidth?: number; plotHeight?: number } = {},
): BalanceChartGeometry {
  const { stepIncreases = false, dashes = false, plotWidth = 264, plotHeight = 110 } = options
  if (samples.length === 0) return { kind: 'empty', points: '', positions: [] }
  const { positions, runs } = timeAxis(samples, dashes)
  const kept = new Set(downsample(samples, MAX_POINTS))
  if (stepIncreases) {
    for (let index = 1; index < samples.length; index += 1) {
      if (atIndex(samples, index).value <= atIndex(samples, index - 1).value) continue
      kept.add(index - 1)
      kept.add(index)
    }
  }
  const compressedEnds = new Set<number>()
  for (const run of runs) {
    kept.add(run.start)
    kept.add(run.end)
    compressedEnds.add(run.end)
    for (let index = run.start + 1; index < run.end; index += 1) kept.delete(index)
  }
  const picked = [...kept].sort((a, b) => a - b)
  const values = picked.map(index => atIndex(samples, index).value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const range = { low, high }
  const coords = picked.map((index) => {
    const sample = atIndex(samples, index)
    const x = LEFT + atIndex(positions, index) * WIDTH
    const y = high === low ? (TOP + BOTTOM) / 2 : BOTTOM - ((sample.value - low) * (BOTTOM - TOP)) / (high - low)
    return { x, y, index }
  })
  const first = atIndex(coords, 0)
  if (coords.length === 1) return { kind: 'single', points: '', dot: { x: first.x, y: first.y }, range, positions }
  const points = coords.map(point => `${point.x},${point.y}`).join(' ')
  const gaps = dashes ? gapEnds(samples, gapThreshold(samples)) : undefined
  let path = `M${first.x},${first.y}`, increases = '', compressed = '', missing = ''
  let previous = first
  for (const current of coords.slice(1)) {
    const flat = compressedEnds.has(current.index)
    if (flat || (gaps !== undefined && atIndex(gaps, current.index) !== atIndex(gaps, previous.index))) {
      const length = Math.hypot((current.x - previous.x) * plotWidth / 264, (current.y - previous.y) * plotHeight / 110)
      if (length < 2 * DASH_PX + GAP_PX) path += ` L${current.x},${current.y}`
      else {
        path += ` M${current.x},${current.y}`
        if (flat) compressed += `M${previous.x},${previous.y} H${current.x} `
        else missing += `M${previous.x},${previous.y} L${current.x},${current.y} `
      }
    } else if (stepIncreases && current.y < previous.y) {
      path += ` H${current.x} M${current.x},${current.y}`
      increases += `M${current.x},${previous.y} V${current.y} `
    } else path += ` L${current.x},${current.y}`
    previous = current
  }
  const series = { kind: 'series' as const, points, range, positions }
  if (!stepIncreases && runs.length === 0 && missing === '') return series
  return { ...series, path, increases: increases.trimEnd(), compressed: compressed.trimEnd(), gaps: missing.trimEnd() }
}

function downsample(items: readonly BalanceChartSample[], max: number): number[] {
  if (items.length <= max) return items.map((_sample, index) => index)
  const last = items.length - 1
  const picked = [0]
  const buckets = Math.floor((max - 2) / 2)
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = 1 + Math.floor(bucket * (last - 1) / buckets)
    const end = 1 + Math.floor((bucket + 1) * (last - 1) / buckets)
    let low: { index: number; sample: BalanceChartSample } | undefined
    let high: { index: number; sample: BalanceChartSample } | undefined
    for (const [index, sample] of items.slice(start, end).entries()) {
      if (low === undefined || sample.value < low.sample.value) low = { index, sample }
      if (high === undefined || sample.value > high.sample.value) high = { index, sample }
    }
    if (low === undefined || high === undefined) continue
    if (low.index === high.index) picked.push(start + low.index)
    else picked.push(start + Math.min(low.index, high.index), start + Math.max(low.index, high.index))
  }
  picked.push(last)
  return picked
}

/**
 * Find the original observation nearest to a horizontal position in the plot.
 * @param positions - Fractions along the displayed axis, one per original observation.
 * @param fraction - Pointer position on that axis, clamped to its ends.
 * @returns Original sample index, including observations omitted from the drawn polyline.
 */
export function nearestBalanceSample(positions: readonly number[], fraction: number): number {
  if (positions.length === 0) return 0
  const position = Math.max(0, Math.min(1, fraction))
  let low = 0, high = positions.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (atIndex(positions, middle) < position) low = middle + 1
    else high = middle
  }
  const previous = positions[low - 1]
  return previous !== undefined && position - previous <= atIndex(positions, low) - position ? low - 1 : low
}

/**
 * Keep an inspected observation across replacements of the chart history.
 * @param samples - Current observations in ascending time order.
 * @param observation - The previously selected time and amount.
 * @returns Its current index or the closest retained time; zero if the observations are empty.
 */
export function retainedBalanceSample(samples: readonly BalanceChartSample[], observation: BalanceChartSample): number {
  let low = 0, high = samples.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (atIndex(samples, middle).time < observation.time) low = middle + 1
    else high = middle
  }
  for (let index = low; index < samples.length; index += 1) {
    const candidate = atIndex(samples, index)
    if (candidate.time !== observation.time) break
    if (candidate.value === observation.value && candidate.exactValue === observation.exactValue) return index
  }
  const previous = samples[low - 1], next = samples[low]
  if (next === undefined) return Math.max(0, low - 1)
  return previous !== undefined && observation.time - previous.time <= next.time - observation.time ? low - 1 : low
}
