/** Canonical tool-definition fixtures for repository tests. @module @deepseek-ai/dsh-tool-testkit */
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline';
import { defineTool } from '@deepseek-ai/dsh-tools';
const CONTENT_VALUE_SCHEMA = { type: 'array', items: { type: 'json' } };
/**
 * Define a test fixture that deliberately uses its content blocks as the
 * canonical JSON value. Product tools must declare domain-owned DTOs instead.
 * @param options - ordinary fixture fields plus a content-producing body.
 * @returns a registry-ready tool with an explicit JSON-array output contract.
 * @internal
 */
export function defineContentToolFixture(options) {
    // oxlint-disable-next-line typescript/unbound-method
    const execute = options.execute;
    return defineTool({
        ...options,
        output: {
            schema: CONTENT_VALUE_SCHEMA,
            render: (_args, value) => value,
        },
        async execute(args, exec) {
            const value = await execute(args, exec);
            return value;
        },
    });
}
/**
 * Exercise invocation stages directly, preserving parsed and nested test inputs.
 * Use executeModelToolFixture for a complete single-call batch.
 * @param ctx - context owning the tool definitions and execution policy.
 * @param input - parsed invocation, including nested identity when testing a composite.
 * @returns the settled capability result.
 * @internal
 */
export async function executeToolFixture(ctx, input) {
    const pipeline = new ToolExecutionPipeline(ctx);
    const prepared = await pipeline.prepare(input);
    const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared;
    return pipeline.complete(prepared.exec, outcome);
}
/**
 * Run one raw call through the selected executor without root Session logging.
 * @param ctx - context owning the selected executor.
 * @param input - JSON arguments, optional Agent supplying scoped tools and tool context, and optional step admission.
 * @returns the single settled result.
 * @internal
 */
export async function executeModelToolFixture(ctx, input) {
    const args = JSON.stringify(input.arguments);
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- JSON.stringify returns undefined for non-JSON fixture arguments
    if (args === undefined)
        throw new TypeError('Model tool fixture arguments must encode as JSON');
    const batch = await ctx.tools.execute({
        calls: [{ type: 'tool-call', id: input.callId, name: input.name, arguments: args }],
        signal: input.signal,
        ...input.agent === undefined ? {} : { agent: input.agent },
        ...input.toolSet === undefined ? {} : { toolSet: input.toolSet },
    });
    const outcome = batch.results[0];
    if (outcome === undefined)
        throw new Error('Executor omitted the model tool fixture result');
    return outcome.result;
}
//# sourceMappingURL=index.js.map