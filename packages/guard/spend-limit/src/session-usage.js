/** Session-local estimates from durable usage; independent of whether admission limits are enabled. */
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm';
import { usageCost } from "./pricing.js";
/** Maximum points returned by the session-cost RPC; totals still cover every request. */
const MAX_POINTS = 240;
/**
 * Estimate answers, retries, memory extractions and composer predictions across related sessions.
 * @param events - Durable events including route headers and optional inherited prefix.
 * @param rates - Current deployment rates; missing rates remain explicitly unpriced.
 * @param inheritedEventCount - Session-validated length of the full inherited prefix, including ancestors.
 * @param related - Independently recorded side-conversation histories.
 * @returns CNY totals, coverage counts and a bounded cumulative curve.
 */
export function sessionSpendUsage(events, rates, inheritedEventCount, related = []) {
    const primary = collectSpend({ events, inheritedEventCount }, rates);
    const settled = [...primary.settled];
    let unknown = primary.unknown;
    for (const log of related) {
        const additional = collectSpend(log, rates);
        unknown += additional.unknown;
        for (const entry of additional.settled)
            settled.push(entry);
    }
    if (related.length > 0)
        settled.sort((a, b) => a.time - b.time);
    let total = 0;
    const requests = settled.length + unknown;
    let points = settled.map((entry) => {
        if (entry.cost === undefined)
            unknown++;
        else
            total += entry.cost;
        return { time: entry.time, total: total / 1_000_000 };
    });
    if (points.length > MAX_POINTS) {
        const keep = new Set(Array.from({ length: MAX_POINTS }, (_, index) => Math.round(index * (points.length - 1) / (MAX_POINTS - 1))));
        points = points.filter((_, index) => keep.has(index));
    }
    return { total: total / 1_000_000, requests, unpricedRequests: unknown, points };
}
function collectSpend({ events, inheritedEventCount }, rates) {
    let route;
    let last;
    let missingId = 0;
    const pending = new Map();
    const settled = new Map();
    function settle(seq, time, request, usage) {
        const rate = request && rates.find(value => value.providers.includes(request.provider) && value.models.includes(request.model));
        settled.set(seq, { time, cost: rate && usage ? usageCost(rate, usage) : undefined });
    }
    for (const event of events) {
        if (event.type === 'request/header')
            route = event.data.header.config;
        if (event.seq < inheritedEventCount)
            continue;
        if (event.type === 'memory/extraction' || event.type === 'input/prediction') {
            const key = event.data.requestId === undefined ? undefined : event.type + ':' + event.data.requestId;
            if (event.data.phase === 'request') {
                if (key === undefined)
                    missingId++;
                else
                    pending.set(key, event.type === 'input/prediction' ? event.data.request : event.data);
            }
            else if (key !== undefined && pending.has(key)) {
                settle(event.seq, event.time, pending.get(key), event.data.usage);
                pending.delete(key);
            }
            continue;
        }
        if (event.type === 'llm/retry-started') {
            last = undefined;
            continue;
        }
        if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt')
            continue;
        const usage = event.type === 'assistant/message' && event.data.usage !== undefined
            ? event.data.usage : lastAssistantStreamChunk(event.data.stream, 'usage')?.usage;
        if (last?.turn === event.data.turn && last.step === event.data.step)
            settled.delete(last.seq);
        settle(event.seq, event.time, route, usage);
        last = { turn: event.data.turn, step: event.data.step, seq: event.seq };
    }
    return { settled: settled.values(), unknown: pending.size + missingId };
}
//# sourceMappingURL=session-usage.js.map