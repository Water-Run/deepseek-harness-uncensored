/** Numeric interpolation for a formatted currency string. The ledger and sampler are unchanged. */

/**
 * Currency mark and sign that must stay put while the digits move.
 * @param text - Formatted balance, including a symbol.
 * @returns The non-numeric prefix, so a currency change can snap instead of animating.
 */
export function amountPrefix(text: string): string {
  return text.replace(/-?\d[\d,]*\.?\d*/u, '')
}

/**
 * Read a comparable amount from formatted currency text.
 * @param text - Formatted balance.
 * @returns The number, or undefined for sub-cent placeholders and non-numeric text.
 */
export function amountNumber(text: string): number | undefined {
  if (text.includes('<')) return undefined
  const match = /-?\d[\d,]*\.?\d*/u.exec(text)
  if (match === null) return undefined
  const value = Number(match[0].replaceAll(',', ''))
  return Number.isFinite(value) ? value : undefined
}

/**
 * Render an in-between amount with the target's symbol and two decimals.
 * @param template - The destination formatted string.
 * @param value - Interpolated amount.
 * @returns Grouped currency text. The animation snaps to `template` when it finishes.
 */
export function formatRolling(template: string, value: number): string {
  const negative = value < 0
  const [integer, fraction] = Math.abs(value).toFixed(2).split('.')
  const grouped = Number(integer).toLocaleString('en-US')
  const symbol = template.replace(/^-/u, '').replace(/[\d.,].*/u, '')
  return `${negative ? '-' : ''}${symbol}${grouped}.${fraction}`
}
