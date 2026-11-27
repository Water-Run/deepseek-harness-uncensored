import type { GenerateOptions, LlmModelReasoningInfo, LlmResolvedModelInfo, StreamChunk, SystemPromptUpdate, ToolUpdate } from '@deepseek-ai/dsh-llm';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
/** Helpers to write scripted responses tersely. */
export declare function textResponse(text: string): StreamChunk[];
/**
 * Like {@link textResponse} but the stream ends with a `max-tokens` finish —
 * the model was cut off at the output-token ceiling (DeepSeek's `length`).
 * Used to exercise the turn-end `max-tokens` surfacing rule.
 */
export declare function maxTokensResponse(text: string): StreamChunk[];
export declare function toolCallResponse(rawCallId: string, name: string, args: object, text?: string): StreamChunk[];
/** Script entry that streams the given chunks, then hangs until aborted. */
export interface HangAfter {
    hangAfter: StreamChunk[];
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
export declare class MockAdapter extends LlmAdapter {
    private script;
    private readonly reasoning?;
    private readonly defaultMaxTokens?;
    requests: GenerateOptions[];
    /** Declared system prompt update mode of every route this adapter serves. */
    systemPromptUpdate?: SystemPromptUpdate;
    /** Declared tool update mode of every route this adapter serves. */
    toolUpdate?: ToolUpdate;
    constructor(script: (StreamChunk[] | ((options: GenerateOptions) => StreamChunk[]) | 'hang' | 'hang-slow' | HangAfter)[], reasoning?: LlmModelReasoningInfo | undefined, defaultMaxTokens?: number | undefined);
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
//# sourceMappingURL=mock-adapter.d.ts.map