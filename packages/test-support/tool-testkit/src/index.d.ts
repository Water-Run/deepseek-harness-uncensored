/** Canonical tool-definition fixtures for repository tests. @module @deepseek-ai/dsh-tool-testkit */
import type { Context } from '@deepseek-ai/cordis';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { DefineToolOptions, InferArgs, ParameterSchemaSpec, ToolDefinition, ToolExecutionInput, ToolExecutionResult, ToolRunContext } from '@deepseek-ai/dsh-tools';
declare const CONTENT_VALUE_SCHEMA: {
    readonly type: "array";
    readonly items: {
        readonly type: "json";
    };
};
/** Options for a fixture whose canonical value is its rendered content array. */
export type ContentToolFixtureOptions<S extends ParameterSchemaSpec> = Omit<DefineToolOptions<S, typeof CONTENT_VALUE_SCHEMA>, 'output' | 'execute'> & {
    /** Produce the fixture's content blocks as its canonical test value. */
    execute(args: InferArgs<S>, exec: ToolRunContext): Promise<ContentBlock[]>;
};
/**
 * Define a test fixture that deliberately uses its content blocks as the
 * canonical JSON value. Product tools must declare domain-owned DTOs instead.
 * @param options - ordinary fixture fields plus a content-producing body.
 * @returns a registry-ready tool with an explicit JSON-array output contract.
 * @internal
 */
export declare function defineContentToolFixture<const S extends ParameterSchemaSpec>(options: ContentToolFixtureOptions<S>): ToolDefinition;
/**
 * Exercise invocation stages directly, preserving parsed and nested test inputs.
 * Use executeModelToolFixture for a complete single-call batch.
 * @param ctx - context owning the tool definitions and execution policy.
 * @param input - parsed invocation, including nested identity when testing a composite.
 * @returns the settled capability result.
 * @internal
 */
export declare function executeToolFixture(ctx: Context, input: ToolExecutionInput): Promise<ToolExecutionResult>;
/**
 * Run one raw call through the selected executor without root Session logging.
 * @param ctx - context owning the selected executor.
 * @param input - JSON arguments, optional Agent supplying scoped tools and tool context, and optional step admission.
 * @returns the single settled result.
 * @internal
 */
export declare function executeModelToolFixture(ctx: Context, input: Pick<ToolExecutionInput, 'callId' | 'name' | 'arguments' | 'signal' | 'agent' | 'toolSet'>): Promise<ToolExecutionResult>;
export {};
//# sourceMappingURL=index.d.ts.map