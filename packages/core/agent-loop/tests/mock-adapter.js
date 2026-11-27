import { brandString } from '@deepseek-ai/dsh-brand';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
/** Helpers to write scripted responses tersely. */
export function textResponse(text) {
    return [
        { type: 'block-start', index: 0, blockType: 'text' },
        ...Array.from(text, (char) => ({ type: 'text-delta', index: 0, text: char })),
        { type: 'block-end', index: 0, block: { type: 'text', text } },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
        { type: 'finish', reason: { kind: 'stop' } },
    ];
}
/**
 * Like {@link textResponse} but the stream ends with a `max-tokens` finish —
 * the model was cut off at the output-token ceiling (DeepSeek's `length`).
 * Used to exercise the turn-end `max-tokens` surfacing rule.
 */
export function maxTokensResponse(text) {
    return [
        { type: 'block-start', index: 0, blockType: 'text' },
        ...Array.from(text, (char) => ({ type: 'text-delta', index: 0, text: char })),
        { type: 'block-end', index: 0, block: { type: 'text', text } },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
        { type: 'finish', reason: { kind: 'max-tokens' } },
    ];
}
export function toolCallResponse(rawCallId, name, args, text) {
    const callId = brandString(rawCallId);
    const argumentsJson = JSON.stringify(args);
    const chunks = [];
    let index = 0;
    if (text) {
        chunks.push({ type: 'block-start', index, blockType: 'text' }, { type: 'text-delta', index, text }, { type: 'block-end', index, block: { type: 'text', text } });
        index += 1;
    }
    chunks.push({ type: 'block-start', index, blockType: 'tool-call' }, { type: 'tool-call-delta', index, id: callId, name, argumentsDelta: argumentsJson.slice(0, 5) }, { type: 'tool-call-delta', index, id: callId, argumentsDelta: argumentsJson.slice(5) }, {
        type: 'block-end',
        index,
        block: { type: 'tool-call', id: callId, name, arguments: argumentsJson },
    }, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }, { type: 'finish', reason: { kind: 'tool-calls' } });
    return chunks;
}
/**
 * Mock adapter driven by a script: each model call consumes the next entry.
 * Records every request it receives for assertions. An entry may be a
 * function to compute chunks from the request, a 'hang' marker that
 * streams one chunk then waits until aborted, 'hang-slow' which takes
 * 50ms to notice the abort — a stand-in for slow real-world teardown
 * (LLM stream cancellation, tool unwinding) — or a {@link HangAfter}
 * scripting the exact chunks delivered before the hang.
 */
export class MockAdapter extends LlmAdapter {
    script;
    reasoning;
    defaultMaxTokens;
    requests = [];
    /** Declared system prompt update mode of every route this adapter serves. */
    systemPromptUpdate;
    /** Declared tool update mode of every route this adapter serves. */
    toolUpdate;
    constructor(script, reasoning, defaultMaxTokens) {
        super();
        this.script = script;
        this.reasoning = reasoning;
        this.defaultMaxTokens = defaultMaxTokens;
    }
    resolveModel(provider, model) {
        return Promise.resolve({
            provider,
            id: model,
            name: model,
            ...this.reasoning === undefined ? {} : { reasoning: this.reasoning },
            ...this.defaultMaxTokens === undefined ? {} : { defaultMaxTokens: this.defaultMaxTokens },
            ...this.systemPromptUpdate === undefined ? {} : { systemPromptUpdate: this.systemPromptUpdate },
            ...this.toolUpdate === undefined ? {} : { toolUpdate: this.toolUpdate },
        });
    }
    async *stream(options) {
        this.requests.push(options);
        const entry = this.script.shift();
        if (!entry)
            throw new Error('MockAdapter: script exhausted');
        if (entry === 'hang') {
            yield { type: 'block-start', index: 0, blockType: 'text' };
            yield { type: 'text-delta', index: 0, text: 'partial' };
            await new Promise((_resolve, reject) => {
                if (options.signal?.aborted) {
                    reject(new Error('aborted'));
                    return;
                }
                options.signal?.addEventListener('abort', () => { reject(new Error('aborted')); }, { once: true });
            });
            return;
        }
        if (typeof entry === 'object' && !Array.isArray(entry) && 'hangAfter' in entry) {
            for (const chunk of entry.hangAfter)
                yield chunk;
            await new Promise((_resolve, reject) => {
                if (options.signal?.aborted) {
                    reject(new Error('aborted'));
                    return;
                }
                options.signal?.addEventListener('abort', () => { reject(new Error('aborted')); }, { once: true });
            });
            return;
        }
        if (entry === 'hang-slow') {
            yield { type: 'block-start', index: 0, blockType: 'text' };
            yield { type: 'text-delta', index: 0, text: 'partial' };
            await new Promise((_resolve, reject) => {
                const fail = () => { reject(new Error('aborted')); };
                if (options.signal?.aborted) {
                    setTimeout(fail, 50);
                    return;
                }
                options.signal?.addEventListener('abort', () => { setTimeout(fail, 50); }, { once: true });
            });
            return;
        }
        const chunks = typeof entry === 'function' ? entry(options) : entry;
        for (const chunk of chunks) {
            if (options.signal?.aborted)
                throw new Error('aborted');
            yield chunk;
        }
    }
}
//# sourceMappingURL=mock-adapter.js.map