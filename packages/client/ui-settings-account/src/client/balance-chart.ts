/** Geometry for the local balance sample curve. Sampling and rates stay elsewhere. */

/** One plotted observation. */
export interface BalanceChartSample {
  readonly time: number
  readonly value: number
}

/** Drawable curve. A single sample is a dot; longer histories keep the ends and at most 120 points. */
export interface BalanceChartGeometry {
  readonly kind: 'empty' | 'single' | 'series'
  readonly points: string
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

/**
 * Project samples into the fixed balance chart view box.
 * @param samples - Observations for one currency, in time order.
 * @returns Empty, one dot, or a downsampled polyline.
 */
export function balanceChart(samples: readonly BalanceChartSample[]): BalanceChartGeometry {
  if (samples.length === 0) return { kind: 'empty', points: '' }
  const picked = downsample(samples, MAX_POINTS)
  const firstSample = picked[0]
  const lastSample = picked[picked.length - 1]
  if (firstSample === undefined || lastSample === undefined) return { kind: 'empty', points: '' }
  const values = picked.map(sample => sample.value)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const range = { low, high }
  const start = firstSample.time
  const end = lastSample.time
  const coords = picked.map((sample, index) => {
    const x = end === start
      ? LEFT + index * WIDTH / Math.max(1, picked.length - 1)
      : LEFT + (sample.time - start) * WIDTH / (end - start)
    const y = high === low ? (TOP + BOTTOM) / 2 : BOTTOM - ((sample.value - low) * (BOTTOM - TOP)) / (high - low)
    return { x, y }
  })
  const first = coords[0]
  if (first === undefined) return { kind: 'empty', points: '' }
  if (coords.length === 1) return { kind: 'single', points: '', dot: first, range }
  return { kind: 'series', points: coords.map(point => `${point.x},${point.y}`).join(' '), range }
}

function downsample(items: readonly BalanceChartSample[], max: number): BalanceChartSample[] {
  if (items.length <= max) return [...items]
  const last = items.length - 1
  const picked = items.slice(0, 1)
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
    if (low.index === high.index) picked.push(low.sample)
    else if (low.index < high.index) picked.push(low.sample, high.sample)
    else picked.push(high.sample, low.sample)
  }
  picked.push(...items.slice(-1))
  return picked
}

/**
 * Find the original observation nearest to a horizontal position in the plot.
 * @param samples - Nonempty observations ordered by time.
 * @param fraction - Pointer position relative to the time span; clamped to its ends.
 * @returns Original sample index, including observations omitted from the drawn polyline.
 */
export function nearestBalanceSample(samples: readonly BalanceChartSample[], fraction: number): number {
  const first = samples[0], last = samples.at(-1)
  if (first === undefined || last === undefined) return 0
  const position = Math.max(0, Math.min(1, fraction))
  if (first.time === last.time) return Math.round(position * (samples.length - 1))
  const time = first.time + position * (last.time - first.time)
  let low = 0, high = samples.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((samples[middle]?.time ?? last.time) < time) low = middle + 1
    else high = middle
  }
  const previous = samples[low - 1], next = samples[low]
  return previous !== undefined && next !== undefined && time - previous.time <= next.time - time ? low - 1 : low
}
