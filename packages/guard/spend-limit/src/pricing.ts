/** Conservative published peak-rate quotes; unknown routes cannot pass an enabled limit. */
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SpendRate } from './types.ts'

/** Official Flash peak prices checked 2026-10-23; deployment configuration can replace them. */
export const DEFAULT_RATES: SpendRate[] = [{ providers: ['deepseek-official', 'deepseek-account'], models: ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'], input: 2, cachedInput: 0.04, cacheWrite: 2, output: 8, contextTokens: 1_000_000, maxOutputTokens: 256_000, searchRequest: 0.005 }]

/**
 * Calculate a conservative request reservation using the entire configured context allowance.
 * @param rate - Matching deployment rate.
 * @param maxTokens - Exact output ceiling from the request, or the configured provider default.
 * @param searches - Maximum native search uses.
 * @returns Integer micro-CNY; rounding always increases the estimate.
 */
export function reserveCost(rate: SpendRate, maxTokens: number | undefined, searches = 0): number {
  return Math.ceil(rate.contextTokens * Math.max(rate.input, rate.cachedInput, rate.cacheWrite)
    + (maxTokens ?? rate.maxOutputTokens) * rate.output + searches * rate.searchRequest * 1_000_000)
}

/**
 * Price disjoint usage counters; reasoning tokens are already included in output tokens.
 * @param rate - Rate captured before dispatch.
 * @param usage - Complete final provider counters.
 * @param searches - Successful native search uses.
 * @returns Integer micro-CNY.
 */
export function usageCost(rate: SpendRate, usage: TokenUsage, searches = 0): number {
  return Math.ceil(usage.inputTokens * rate.input + (usage.cacheReadTokens ?? 0) * rate.cachedInput
    + (usage.cacheWriteTokens ?? 0) * rate.cacheWrite + usage.outputTokens * rate.output + searches * rate.searchRequest * 1_000_000)
}
