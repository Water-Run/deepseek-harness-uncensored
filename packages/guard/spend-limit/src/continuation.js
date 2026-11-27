import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm';
/**
 * Create a logged system-origin notice for the pending task.
 * @param pauseId - Durable pause identity, preserved across recovery attempts.
 * @returns The notice delivered only after spending capacity becomes available.
 */
export function spendContinuationMessage(pauseId) {
    return createUserMessage({
        content: [{ type: 'text', text: '额度已恢复。请从暂停处继续原来的任务，不要重复已经完成的步骤。 / Spending capacity recovered. Continue the paused task from where it stopped, without repeating finished steps.' }],
        source: { kind: 'spend-limit', pauseId, form: 'notice', summary: boundContextSummary('额度恢复后继续执行暂停的对话') },
    });
}
/**
 * Queue a recovered pause at most once in one Session log, including after a crash before ledger acknowledgement.
 * @param agent - Agent restored by its normal owner.
 * @param claim - The exclusively claimed pause.
 * @returns Whether this task was accepted or is already running.
 */
export function queueSpendContinuation(agent, claim) {
    const matches = (message) => message.source.kind === 'spend-limit' && message.source.pauseId === claim.id;
    if (agent.inbox.nextTurn.some(matches) || agent.inbox.nextStep.some(matches)
        // oxlint-disable-next-line typescript/no-deprecated -- Recovery deduplicates rare persisted continuations, outside the append hot path.
        || agent.session.snapshotEvents().some(event => event.type === 'user/message' && matches(event.data)))
        return 'continued';
    if (agent.status === 'running')
        return 'running';
    agent.followup(spendContinuationMessage(claim.id));
    return 'continued';
}
/** One serialized recovery worker whose disposer drains all provider calls before the ledger closes. */
export class SpendRecovery {
    report;
    provider;
    active;
    closed = false;
    /** @param report - Visible owner-level reporting for retained pauses that could not resume. */
    constructor(report) {
        this.report = report;
    }
    /**
     * Install one conversation lifecycle owner.
     * @param handler - Restores and queues through the normal conversation path.
     * @param capture - Whether this provider owns the live conversation and can restore its composition.
     * @returns A disposer that cancels and drains calls before the provider unloads.
     */
    register(handler, capture) {
        if (this.closed || this.provider !== undefined)
            throw new Error('spend-limit: continuation provider unavailable or already registered');
        const provider = { handler, capture, abort: new AbortController() };
        this.provider = provider;
        return async () => {
            if (this.provider === provider)
                this.provider = undefined;
            provider.abort.abort();
            await this.active;
        };
    }
    /**
     * Check whether the registered lifecycle owner can recover this live conversation.
     * @param id - Session whose request is about to wait.
     * @returns False for unowned runtimes and after provider disposal.
     */
    canCapture(id) { return !this.closed && this.provider?.capture(id) === true; }
    /**
     * Run or join one recovery pass without overlapping another provider call.
     * @param gate - Open ledger and admission owner.
     * @returns Completion of the shared recovery pass.
     */
    flush(gate) {
        if (this.closed || this.provider === undefined)
            return Promise.resolve();
        if (this.active !== undefined)
            return this.active;
        const provider = this.provider;
        const cancelled = () => provider.abort.signal.aborted;
        const task = Promise.resolve().then(async () => {
            if (this.closed || cancelled())
                return;
            const claims = gate.ledger.claimBlockedSessions();
            for (const claim of claims) {
                try {
                    if (cancelled() || !gate.ledger.ownsClaim(claim.id)) {
                        gate.ledger.releaseClaim(claim.id);
                        continue;
                    }
                    const result = await provider.handler(claim, provider.abort.signal);
                    provider.abort.signal.throwIfAborted();
                    if (!gate.ledger.ownsClaim(claim.id))
                        continue;
                    if (result === 'unavailable')
                        gate.ledger.releaseClaim(claim.id);
                    else {
                        if (result !== 'missing') {
                            queueSpendContinuation(result.agent, claim);
                            await result.flush();
                            provider.abort.signal.throwIfAborted();
                        }
                        gate.ledger.completeClaim(claim.id);
                    }
                }
                catch (error) {
                    gate.ledger.releaseClaim(claim.id);
                    if (!cancelled())
                        this.report(error);
                }
            }
        }).catch(this.report).finally(() => { if (this.active === task)
            this.active = undefined; });
        this.active = task;
        return task;
    }
    /** Stop new recovery and drain the active provider call before releasing its dependencies. */
    async close() {
        this.closed = true;
        this.provider?.abort.abort();
        await this.active;
    }
}
//# sourceMappingURL=continuation.js.map