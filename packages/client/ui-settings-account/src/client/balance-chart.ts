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
}

const LEFT = 12
const WIDTH = 276
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
  const start = firstSample.time
  const end = lastSample.time
  const coords = picked.map((sample, index) => {
    const x = end === start
      ? LEFT + index * WIDTH / Math.max(1, picked.length - 1)
      : LEFT + (sample.time - start) * WIDTH / (end - start)
    const y = high === low ? 55 : 98 - ((sample.value - low) * 86) / (high - low)
    return { x, y }
  })
  const first = coords[0]
  if (first === undefined) return { kind: 'empty', points: '' }
  if (coords.length === 1) return { kind: 'single', points: '', dot: first }
  return { kind: 'series', points: coords.map(point => `${point.x},${point.y}`).join(' ') }
}

function downsample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items]
  const last = items.length - 1
  const picked: T[] = []
  for (let index = 0; index < max; index += 1) {
    const item = items[Math.round((index * last) / (max - 1))]
    if (item !== undefined && picked[picked.length - 1] !== item) picked.push(item)
  }
  const tail = items[last]
  if (tail !== undefined && picked[picked.length - 1] !== tail) picked.push(tail)
  return picked
}
