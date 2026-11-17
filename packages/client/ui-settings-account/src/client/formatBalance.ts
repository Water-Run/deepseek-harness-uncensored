/** Platform Web currency formatting for account balances; source amounts retain decimal precision. */
import { Big } from 'big.js'

/**
 * Format a balance using Platform Web's two-decimal and sub-cent display rules.
 * @param amount - validated decimal balance string.
 * @param symbol - currency symbol.
 * @returns signed currency text with grouped digits.
 */
export function formatBalance(amount: string, symbol: '¥' | '$'): string {
  const value = new Big(amount)
  if (value.eq(0)) return `${symbol}0.00`
  if (value.lt(0)) return `-${symbol}${value.gt(-0.01) ? '0.01' : addCommas(value.abs().toFixed(2))}`
  if (value.lt('0.01')) return `<${symbol}0.01`
  return `${symbol}${addCommas(value.round(2, Big.roundDown).toFixed(2))}`
}

function addCommas(value: string): string {
  const [integer, fraction] = value.split('.')
  return `${Number(integer).toLocaleString()}.${fraction}`
}

/**
 * Preserve the sampled decimal amount for history inspection, with at least two decimal places.
 * @param amount - Original decimal observation or exact interval change.
 * @param symbol - Currency symbol.
 * @returns Grouped currency text without discarding sub-cent changes.
 */
export function formatBalanceDetail(amount: string, symbol: '¥' | '$'): string {
  const value = new Big(amount)
  const [integer, fraction = ''] = value.abs().toFixed().split('.')
  return `${value.lt(0) ? '-' : ''}${symbol}${Number(integer).toLocaleString()}.${fraction.padEnd(2, '0')}`
}
