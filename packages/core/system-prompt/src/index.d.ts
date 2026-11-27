/**
 * Registry for ordered system sections, dynamic context, tool schemas, and prompt variables.
 *
 * @module @deepseek-ai/dsh-system-prompt
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ScopeKey, Scoped } from '@deepseek-ai/dsh-scope';
import type { ContextSnapshotSection, SystemMessage, ToolSchema } from '@deepseek-ai/dsh-llm';
import type { Session, SurfaceIntent } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/cordis' {
    interface Context {
        systemPrompt: SystemPrompt;
    }
    interface Events {
        /**
         * Presentation waterfall over assembled sections, contexts, and variables.
         * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): scoped listeners
         * receive only that scope's assemblies. Returned section text determines updates;
         * omitting a previously admitted section leaves its instructions unchanged.
         * Empty text withdraws its instructions; registration disposal retires it.
         * Tool declarations remain provider-owned.
         * A supplied signal controls only this explicit assembly request and must not
         * be retained to control later turns. A registered complete section is
         * restored after this waterfall, so listeners cannot add to or replace
         * that scope's system prompt.
         * @param assembly - the mutable assembly built from registered providers.
         * @param context - the caller's per-assembly context.
         * @mode waterfall
         */
        'system-prompt/assemble'(this: Scoped<SystemPrompt>, assembly: PromptPresentation, context: AssembleContext, next: () => Promise<PromptPresentation>): Promise<PromptPresentation>;
        /**
         * Emitted when any prompt provider changes. This registry notification is
         * unfiltered because a global change affects every scope.
         * @mode emit
         */
        'system-prompt/change'(): void;
    }
}
/** Merge-extensible context for one prompt assembly. */
export interface AssembleContext {
    /** Session receiving system updates; omission produces a registry-only presentation. */
    session?: Session;
    /**
     * Scope whose providers and waterfall listeners participate. When absent,
     * only global providers and subject-less listeners participate.
     */
    scope?: ScopeKey;
    /** Explicit control signal for the turn that requested this assembly, when any. */
    signal?: AbortSignal;
}
/** One contributed section of the system prompt (registry input). */
export interface PromptSection {
    /** Logical source name; the nearest scope and latest registration in that scope win. */
    readonly name: string;
    /**
     * Sections are concatenated in ascending order. Equal orders use code-unit
     * name order.
     */
    readonly order: number;
    /**
     * Static text or a provider evaluated with that assembly's {@link AssembleContext}
     * only while this registration is effective. The text may reference `{{variable}}`s — they are
     * interpolated later unless `interpolate` is false, then trimmed before rendering
     * and admission. Interior whitespace is preserved.
     */
    readonly text: string | ((context: AssembleContext) => string);
    /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
    readonly interpolate?: boolean;
    /**
     * Treat this contribution as the complete system prompt. Assembly still
     * runs the cooperative waterfall so tools, contexts, and variables can be
     * resolved, then restores this exact section as the sole prompt section.
     * Admission appends prospective supersession notices on entry, changes,
     * and exit; earlier messages retain their positions until compaction.
     * More than one effective complete section makes assembly fail.
     */
    readonly complete?: boolean;
    /** Optional trimmed notice before changed text; blank text suppresses this notice. */
    readonly replacement?: string;
    /**
     * Literal notice, nonempty after trimming, sent when no visible registration remains
     * to Sessions that previously admitted this name. The last disposed definition captured
     * by the Session supplies the notice; omission uses a notice naming the section.
     * A remaining or newly registered definition is compared as ordinary source text.
     */
    readonly retirement?: string;
}
/** Dynamic model context materialized as a durable user-role snapshot. */
export interface PromptContext {
    /** Unique name — a duplicate registration throws (see {@link SystemPrompt.context}). */
    readonly name: string;
    /** Contexts are joined in ascending order. */
    readonly order: number;
    /** Static text or a provider evaluated at assembly and admission refresh. Empty text contributes nothing. */
    readonly text: string | ((context: AssembleContext) => string);
    /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
    readonly interpolate?: boolean;
    /** Keep this operational context when optional runtime context is disabled. */
    readonly required?: boolean;
}
/** One section of an assembly: {@link PromptSection} with its text resolved. */
export interface AssembledSection {
    /** This contribution exclusively supersedes earlier system-prompt sections from admission onward. */
    complete?: boolean;
    /** Notice preceding an ordinary update to this section. */
    replacement?: string;
    /** This literal text retires a disposed registration. */
    retire?: boolean;
    /** Placement retained for canonical history reconstruction. */
    order: number;
    /** The contributing section's unique name. */
    name: string;
    /** The resolved (but not yet interpolated) section text. */
    text: string;
    /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
    interpolate?: boolean;
}
/** One resolved dynamic context contribution. */
export interface AssembledContext {
    /** The contributing context's unique name. */
    name: string;
    /** The resolved text before variable interpolation. */
    text: string;
    /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
    interpolate?: boolean;
}
/** Tool schemas visible in one assembly and their pre-restriction name set. */
export interface ToolProviderResult {
    /** The schemas this provider contributes to THIS assembly. */
    readonly schemas: readonly ToolSchema[];
    /** The pre-restriction name universe for config validation (defaults to `schemas`' names). */
    readonly knownNames?: readonly string[];
}
/**
 * Prompt text contributions that the assembly waterfall may transform.
 * Sections and contexts remain uninterpolated until rendered; tool
 * declarations are owned by their providers.
 */
export interface PromptPresentation {
    sections: AssembledSection[];
    contexts: AssembledContext[];
    variables: Record<string, string | undefined>;
}
/** One `system/message` write that admits captured sections into a Session. */
export interface SystemUpdate {
    readonly message: SystemMessage;
    readonly intent: SurfaceIntent<'system/message'>;
}
/** Completed model inputs: the presentation plus tool declarations in canonical order. */
export interface PromptAssembly extends PromptPresentation {
    /**
     * Compare the captured sections with the Session's committed state at the time of the call.
     * Append the returned writes in order, without yielding, before each model attempt.
     * A retry returns only the rebuild that compaction requires; an assembly without a Session returns none.
     * @param retry - whether an earlier attempt of the step already committed this assembly.
     */
    systemUpdates: (retry: boolean) => readonly SystemUpdate[];
    tools: ToolSchema[];
}
declare const SECTION_ORDERS: {
    readonly HARNESS_IDENTITY: -1000;
    readonly DEPLOYMENT_PERSONA_PREFIX: 0;
    readonly PLAN_POLICY: 500;
    readonly TEAM_POLICY: 600;
    readonly PTC_ONLY: 800;
    readonly FILE_REFERENCE: 900;
    readonly TOOL_BASH: 1000;
    readonly TOOL_PWSH: 1010;
    readonly TOOL_READ: 1100;
    readonly TOOL_WRITE: 1200;
    readonly TOOL_EDIT: 1300;
    readonly TOOL_APPLY_PATCH: 1350;
    readonly TOOL_GLOB: 1400;
    readonly TOOL_GREP: 1500;
    readonly TOOL_JOBS: 1600;
    readonly TOOL_PTY: 1700;
    readonly TOOL_PTY_PANEL: 1710;
    readonly TOOL_WEB_SEARCH: 2000;
    readonly TOOL_WEB_FETCH: 2100;
    readonly TOOL_LSP: 2200;
    readonly TOOL_SESSION_QUERY: 2300;
    readonly TOOL_GOAL: 2400;
    readonly TOOL_SCHEDULE: 2500;
    readonly TOOL_WORKFLOW: 2600;
    readonly TOOL_RALPH: 2700;
    readonly TOOL_SUBAGENT: 2800;
    readonly TOOL_REPORT: 2900;
    readonly TOOL_COMPUTER_USE: 3000;
    readonly MCP_SERVERS: 3100;
    readonly TOOLS_SDK: 5000;
    readonly DELIVERABLE_FILE_REFERENCES: 9000;
    readonly STRUCTURED_OUTPUT: 9900;
    readonly HARNESS_SOURCE: 10000;
    readonly WEB_SURFACE: 10100;
    readonly DEPLOYMENT_PERSONA_SUFFIX: 10200;
};
/** Name of a centrally allocated prompt-section position. */
export type PromptSectionOrderName = keyof typeof SECTION_ORDERS;
declare const CONTEXT_ORDERS: {
    readonly WORKING_DIRECTORY: 100;
    readonly SANDBOX_POLICY: 110;
    readonly APPROVAL_POLICY: 115;
    readonly SUBAGENT_DELEGATION: 120;
    readonly HARNESS_SOURCE: 200;
    readonly WEB_SURFACE: 210;
    readonly PLUGIN_CLIS: 220;
};
/** Name of a centrally allocated runtime-context position. */
export type PromptContextOrderName = keyof typeof CONTEXT_ORDERS;
/** Persona prefix name for deployment defaults and ordinary scoped section overrides. */
export declare const PERSONA_PREFIX_SECTION = "deployment:persona-prefix";
/** Persona suffix name for deployment defaults and independent scoped section overrides. */
export declare const PERSONA_SUFFIX_SECTION = "deployment:persona-suffix";
/** Reserved {@link Config.toolOrder} marker for unlisted tools. */
export declare const TOOL_ORDER_REST = "<unlisted-tools>";
/** Plugin config: the deployment-authored fragment of the system prompt (see {@link Config.personaPrefix} for its contract). */
export interface Config {
    /** Include the fixed DeepSeek Harness identity before the deployment persona (default true). */
    includeHarnessIdentity?: boolean;
    /** Include optional runtime-context snapshots in model history (default true); required context remains. */
    includeRuntimeContext?: boolean;
    /**
     * Deployment-wide persona prefix template before first-party guidance. A section
     * named {@link PERSONA_PREFIX_SECTION} can override it; `{{variable}}` references are strict.
     */
    personaPrefix?: string;
    /**
     * Persona suffix template after first-party guidance. A section named
     * {@link PERSONA_SUFFIX_SECTION} can override it; `{{variable}}` references are strict. Defaults to empty.
     */
    personaSuffix?: string;
    /**
     * Model-facing tool names in order, with {@link TOOL_ORDER_REST} exactly once.
     * Invalid fields fail at load and unknown names fail at assembly; known names
     * hidden in one scope may be absent there. Omitted means lexicographic order.
     */
    toolOrder?: string[];
}
/**
 * Interpolate strict `{{variable}}` references, trim each section, drop empty
 * text, and join the rest with blank lines. Sections with `interpolate: false` retain literal
 * text except for surrounding whitespace. Malformed, unknown, or undefined
 * references in other sections throw; a lone `{{` without any later `}}` is
 * literal prose, and substituted values are not scanned again.
 * @param assembly - the assembly whose sections and variables to render.
 * @returns the rendered prompt, or `''` when all sections are empty.
 */
export declare function renderPrompt(assembly: PromptAssembly): string;
/**
 * Render the complete dynamic context snapshot, preserving literal contributions.
 * @param assembly - the assembly whose contexts and variables to render.
 * @returns the current full snapshot, or `''` when no context is active.
 */
export declare function renderContextSnapshot(assembly: PromptAssembly): string;
/**
 * The model-facing snapshot text for an already-rendered section list.
 *
 * A caller that also needs the sections renders them once and joins here, so a
 * request does not interpolate every context twice.
 * @param sections - sections from {@link renderContextSections}.
 * @returns the current full snapshot, or `''` when no context is active.
 */
export declare function joinContextSections(sections: readonly ContextSnapshotSection[]): string;
/**
 * The same snapshot, kept as the named contributions it was assembled from.
 *
 * {@link renderContextSnapshot} joins these for the model; a consumer that
 * presents the snapshot uses them to attribute each part to the subsystem that
 * contributed it, without re-splitting the joined prose. Contributions with
 * `interpolate: false` preserve literal text instead of resolving prompt variables.
 * @param assembly - the assembly whose contexts and variables to render.
 * @returns one entry per contributing context that rendered to non-empty text.
 */
export declare function renderContextSections(assembly: PromptAssembly): ContextSnapshotSection[];
/** Registry service for the prompt inputs assembled before each model step. */
export declare class SystemPrompt extends Service {
    static inject: string[];
    static Config: z<Config>;
    private readonly layers;
    private readonly toolOrder;
    /** Orders disposals without retaining dead registrations in the shared registry. */
    private readonly retirementOrder;
    /** Visible owners captured per Session, including disposed definitions awaiting admission. */
    private readonly sessionSources;
    /** Initialized before dependent plugins activate. */
    private admission;
    constructor(ctx: Context, config: Config);
    protected [Service.init](): Promise<void>;
    /**
     * Register a section; the nearest scope wins, then the latest registration
     * within that scope. Disposal reveals the next live definition. Retirement
     * is admitted only after no registration remains in the visible scope chain.
     * @param section - definition, canonical order and optional transition notices.
     * @returns the exact Cordis disposer; retirement is observed at later assembly.
     */
    section(section: PromptSection): () => void;
    /**
     * Resolve the centrally owned placement of a repository prompt section.
     * @param name - stable section placement name.
     * @returns the section's numeric sort order.
     */
    getSectionOrder(name: PromptSectionOrderName): number;
    /**
     * Resolve the centrally owned placement of a repository runtime context.
     * @param name - stable context placement name.
     * @returns the context's numeric sort order.
     */
    getContextOrder(name: PromptContextOrderName): number;
    /**
     * Register ordered dynamic context in the calling context's scope. Scoped
     * entries shadow global entries with the same name.
     * @param context - the context contribution to register.
     * @returns the exact Cordis effect disposer.
     */
    context(context: PromptContext): () => void;
    /**
     * Suppress optional dynamic runtime-context contributions in the calling
     * context's scope without changing the services that own or enforce those
     * facts. Multiple suppressors remain independently disposable.
     * @returns the exact Cordis effect disposer.
     */
    suppressRuntimeContext(): () => void;
    /**
     * Register a tool-schema provider in the calling context's scope. Global and
     * matching scoped providers both contribute; returning the reserved
     * {@link TOOL_ORDER_REST} name makes assembly fail.
     * @param provider - evaluated for each assembly with its context.
     * @returns the exact Cordis effect disposer.
     */
    tools(provider: (context: AssembleContext) => ToolProviderResult): () => void;
    /**
     * Register a prompt variable in the calling context's scope. Scoped values
     * shadow globals; invalid or duplicate names throw. A provider may return
     * `undefined`, but rendering a section that references that value then fails.
     * @param name - the `[a-z][a-z0-9_]*` reference name.
     * @param provider - evaluated for each assembly.
     * @returns the exact Cordis effect disposer.
     */
    variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void;
    /**
     * Refresh accepted registered runtime facts for request admission. Contexts
     * added only by the assembly waterfall retain their accepted values. Current
     * suppression removes optional contexts, and missing required registrations
     * are restored in registry order. Sections, tools, and interpolation variables
     * retain the accepted assembly; their providers and waterfall do not rerun.
     * @param assembly - accepted assembly for this scope and step.
     * @param context - the same scope and current plugin-defined assembly fields.
     * @returns the accepted assembly with current runtime-context provider text.
     */
    refreshContext(assembly: PromptAssembly, context?: AssembleContext): PromptAssembly;
    /**
     * Assemble global and scoped providers, detach tool parameters, apply
     * canonical ordering, then run the presentation waterfall. Scoped variables
     * shadow globals; section IDs have one effective owner. The waterfall's text is authoritative except
     * that an effective complete section is restored afterwards as the sole
     * prompt section; tool declarations stay provider-owned. Section text and
     * lifecycle are fixed here; `systemUpdates()` compares them with committed state later.
     * @param context - the optional scope, step tool set, and plugin-defined assembly fields.
     * @returns the post-waterfall presentation and the system updates for the supplied Session.
     */
    assemble(context?: AssembleContext): Promise<PromptAssembly>;
    /** Writes that bring a Session's committed sections to one assembly's captured sections. */
    private systemUpdates;
}
export default SystemPrompt;
//# sourceMappingURL=index.d.ts.map