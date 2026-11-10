/** Geometry for the local balance sample curve. Sampling and rates stay elsewhere. */

/** One plotted observation. */
export interface BalanceChartSample {
  readonly time: number
  readonly value: number
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
 * @param options - Draw discrete increases and optionally compress unchanged balance runs of at least 30 minutes.
 * @returns Empty, one dot, or a downsampled curve with positions for every original observation.
 */
export function balanceChart(
  samples: readonly BalanceChartSample[], options: { stepIncreases?: boolean; compressFlat?: boolean } = {},
): BalanceChartGeometry {
  const { stepIncreases = false, compressFlat = false } = options
  if (samples.length === 0) return { kind: 'empty', points: '', positions: [] }
  const { positions, runs } = timeAxis(samples, compressFlat)
  const kept = new Set(downsample(samples, MAX_POINTS))
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
  if (!stepIncreases && runs.length === 0) return { kind: 'series', points, range, positions }
  let path = `M${first.x},${first.y}`, increases = '', compressed = ''
  let previous = first
  for (const current of coords.slice(1)) {
    if (compressedEnds.has(current.index)) {
      path += ` M${current.x},${current.y}`
      compressed += `M${previous.x},${previous.y} H${current.x} `
    } else if (stepIncreases && current.y < previous.y) {
      path += ` H${current.x} M${current.x},${current.y}`
      increases += `M${current.x},${previous.y} V${current.y} `
    } else path += ` L${current.x},${current.y}`
    previous = current
  }
  return { kind: 'series', points, path, increases: increases.trimEnd(), compressed: compressed.trimEnd(), range, positions }
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
