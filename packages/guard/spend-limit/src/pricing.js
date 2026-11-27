/** Official Flash peak prices checked 2026-10-23; deployment configuration can replace them. */
export const DEFAULT_RATES = [{ providers: ['deepseek-official', 'deepseek-account'], models: ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'], input: 2, cachedInput: 0.04, cacheWrite: 2, output: 8, contextTokens: 1_000_000, maxOutputTokens: 256_000, searchRequest: 0.005 }];
/**
 * Calculate a conservative request reservation using the entire configured context allowance.
 * @param rate - Matching deployment rate.
 * @param maxTokens - Exact output ceiling from the request, or the configured provider default.
 * @param searches - Maximum native search uses.
 * @returns Integer micro-CNY; rounding always increases the estimate.
 */
export function reserveCost(rate, maxTokens, searches = 0) {
    return Math.ceil(rate.contextTokens * Math.max(rate.input, rate.cachedInput, rate.cacheWrite)
        + (maxTokens ?? rate.maxOutputTokens) * rate.output + searches * rate.searchRequest * 1_000_000);
}
/**
 * Price disjoint usage counters; reasoning tokens are already included in output tokens.
 * @param rate - Rate captured before dispatch.
 * @param usage - Complete final provider counters.
 * @param searches - Successful native search uses.
 * @returns Integer micro-CNY.
 */
export function usageCost(rate, usage, searches = 0) {
    return Math.ceil(usage.inputTokens * rate.input + (usage.cacheReadTokens ?? 0) * rate.cachedInput
        + (usage.cacheWriteTokens ?? 0) * rate.cacheWrite + usage.outputTokens * rate.output + searches * rate.searchRequest * 1_000_000);
}
//# sourceMappingURL=pricing.js.map