import type { SessionEvent, SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { SessionSpendUsage, SpendRate } from './types.ts';
type ModelRoute = {
    readonly provider: string;
    readonly model: string;
};
/** Billing fields in a composer-owned log event. Early records omit the request ID and route. */
type PredictionUsageEvent = Pick<SessionEvent, 'seq' | 'time'> & {
    readonly type: 'input/prediction';
    readonly data: {
        readonly phase: 'request' | 'result';
        readonly requestId?: Branded<'PredictionRequestId'>;
        readonly request?: ModelRoute;
        readonly usage?: TokenUsage;
    };
};
/** One exact session history cut and the prefix it inherited from another session. */
export interface SessionSpendLog {
    readonly events: readonly (SessionEvent | PredictionUsageEvent)[];
    readonly inheritedEventCount: SessionLogOffset;
}
/**
 * Estimate answers, retries, memory extractions and composer predictions across related sessions.
 * @param events - Durable events including route headers and optional inherited prefix.
 * @param rates - Current deployment rates; missing rates remain explicitly unpriced.
 * @param inheritedEventCount - Session-validated length of the full inherited prefix, including ancestors.
 * @param related - Independently recorded side-conversation histories.
 * @returns CNY totals, coverage counts and a bounded cumulative curve.
 */
export declare function sessionSpendUsage(events: readonly (SessionEvent | PredictionUsageEvent)[], rates: readonly SpendRate[], inheritedEventCount: SessionLogOffset, related?: readonly SessionSpendLog[]): SessionSpendUsage;
export {};
//# sourceMappingURL=session-usage.d.ts.map