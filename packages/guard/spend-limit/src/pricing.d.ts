/** Conservative published peak-rate quotes; unknown routes cannot pass an enabled limit. */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { SpendRate } from './types.ts';
/** Official Flash peak prices checked 2026-10-23; deployment configuration can replace them. */
export declare const DEFAULT_RATES: SpendRate[];
/**
 * Calculate a conservative request reservation using the entire configured context allowance.
 * @param rate - Matching deployment rate.
 * @param maxTokens - Exact output ceiling from the request, or the configured provider default.
 * @param searches - Maximum native search uses.
 * @returns Integer micro-CNY; rounding always increases the estimate.
 */
export declare function reserveCost(rate: SpendRate, maxTokens: number | undefined, searches?: number): number;
/**
 * Price disjoint usage counters; reasoning tokens are already included in output tokens.
 * @param rate - Rate captured before dispatch.
 * @param usage - Complete final provider counters.
 * @param searches - Successful native search uses.
 * @returns Integer micro-CNY.
 */
export declare function usageCost(rate: SpendRate, usage: TokenUsage, searches?: number): number;
//# sourceMappingURL=pricing.d.ts.map