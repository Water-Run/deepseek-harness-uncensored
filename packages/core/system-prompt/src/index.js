/**
 * Registry for ordered system sections, dynamic context, tool schemas, and prompt variables.
 *
 * @module @deepseek-ai/dsh-system-prompt
 */
import { Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { AnonymousEntries, NamedEntries, ScopedLayers, scopeTarget } from '@deepseek-ai/dsh-scope';
import { createMessage } from '@deepseek-ai/dsh-llm';
import { assembleSystemAdmission, assertDistinctSections } from "./admission.js";
import { sectionAdmissionsDefinition } from "./projection.js";
const SECTION_ORDERS = {
    HARNESS_IDENTITY: -1000,
    DEPLOYMENT_PERSONA_PREFIX: 0,
    PLAN_POLICY: 500,
    TEAM_POLICY: 600,
    PTC_ONLY: 800,
    FILE_REFERENCE: 900,
    TOOL_BASH: 1000,
    TOOL_PWSH: 1010,
    TOOL_READ: 1100,
    TOOL_WRITE: 1200,
    TOOL_EDIT: 1300,
    TOOL_APPLY_PATCH: 1350,
    TOOL_GLOB: 1400,
    TOOL_GREP: 1500,
    TOOL_JOBS: 1600,
    TOOL_PTY: 1700,
    TOOL_PTY_PANEL: 1710,
    TOOL_WEB_SEARCH: 2000,
    TOOL_WEB_FETCH: 2100,
    TOOL_LSP: 2200,
    TOOL_SESSION_QUERY: 2300,
    TOOL_GOAL: 2400,
    TOOL_SCHEDULE: 2500,
    TOOL_WORKFLOW: 2600,
    TOOL_RALPH: 2700,
    TOOL_SUBAGENT: 2800,
    TOOL_REPORT: 2900,
    TOOL_COMPUTER_USE: 3000,
    MCP_SERVERS: 3100,
    TOOLS_SDK: 5000,
    DELIVERABLE_FILE_REFERENCES: 9000,
    STRUCTURED_OUTPUT: 9900,
    // Local paths and endpoints follow reusable instructions.
    HARNESS_SOURCE: 10000,
    WEB_SURFACE: 10100,
    DEPLOYMENT_PERSONA_SUFFIX: 10200,
};
const CONTEXT_ORDERS = {
    WORKING_DIRECTORY: 100,
    SANDBOX_POLICY: 110,
    APPROVAL_POLICY: 115,
    SUBAGENT_DELEGATION: 120,
    // Process-specific paths and endpoints stay out of the cached system prompt.
    HARNESS_SOURCE: 200,
    WEB_SURFACE: 210,
    PLUGIN_CLIS: 220,
};
/** Persona prefix name for deployment defaults and ordinary scoped section overrides. */
export const PERSONA_PREFIX_SECTION = 'deployment:persona-prefix';
/** Persona suffix name for deployment defaults and independent scoped section overrides. */
export const PERSONA_SUFFIX_SECTION = 'deployment:persona-suffix';
/** Valid variable names: how they are written between the braces. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
/** A complete `{{...}}` reference group at the scan position (validated after). */
const GROUP_AT = /^\{\{([^{}]*)\}\}/;
/** Reserved {@link Config.toolOrder} marker for unlisted tools. */
export const TOOL_ORDER_REST = '<unlisted-tools>';
/**
 * Validate duplicate names and the required {@link TOOL_ORDER_REST} marker.
 * Registered names are checked later because plugins have not loaded yet.
 */
function validateToolOrder(toolOrder) {
    if (toolOrder === undefined)
        return undefined;
    const seen = new Set();
    for (const name of toolOrder) {
        if (seen.has(name))
            throw new Error(`toolOrder lists "${name}" more than once`);
        seen.add(name);
    }
    if (!seen.has(TOOL_ORDER_REST)) {
        throw new Error(`toolOrder must contain the "${TOOL_ORDER_REST}" rest entry (where unlisted tools are inserted)`);
    }
    return toolOrder;
}
/**
 * Apply configured tool order, inserting unlisted tools lexicographically at
 * {@link TOOL_ORDER_REST}. Unknown configured names fail; known but restricted
 * names may be absent.
 */
function orderTools(tools, toolOrder, knownNames) {
    const reserved = tools.find(tool => tool.name === TOOL_ORDER_REST);
    if (reserved !== undefined) {
        throw new Error(`tool provider returned reserved tool name "${TOOL_ORDER_REST}" (reserved for toolOrder's rest entry)`);
    }
    if (toolOrder === undefined)
        return tools.sort(compareToolNames);
    const unknown = toolOrder.filter(name => name !== TOOL_ORDER_REST && !knownNames.has(name));
    if (unknown.length > 0) {
        throw new Error(`toolOrder lists unregistered tool${unknown.length > 1 ? 's' : ''} ${unknown.map(name => `"${name}"`).join(', ')}; known tools: ${[...knownNames].sort().join(', ') || '(none)'}`);
    }
    const listed = new Set(toolOrder);
    const rest = tools.filter(tool => !listed.has(tool.name)).sort(compareToolNames);
    return toolOrder.flatMap(name => name === TOOL_ORDER_REST ? rest : tools.filter(tool => tool.name === name));
}
/** Code-unit name comparison — locale-independent, so the order is identical on every machine. */
function compareNames(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** Order prompt sections by their explicit placement, then deterministically by name. */
function comparePromptSections(a, b) {
    return a.order - b.order || compareNames(a.name, b.name);
}
/** Order tool schemas lexicographically by name. */
function compareToolNames(a, b) {
    return compareNames(a.name, b.name);
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
export function renderPrompt(assembly) {
    return assembly.sections.filter(section => !section.retire)
        .map(section => section.interpolate === false ? section.text : interpolate(section, assembly.variables, 'section'))
        .map(text => text.trim())
        .filter(text => text.length > 0)
        .join('\n\n');
}
/**
 * Render the complete dynamic context snapshot, preserving literal contributions.
 * @param assembly - the assembly whose contexts and variables to render.
 * @returns the current full snapshot, or `''` when no context is active.
 */
export function renderContextSnapshot(assembly) {
    return joinContextSections(renderContextSections(assembly));
}
/**
 * The model-facing snapshot text for an already-rendered section list.
 *
 * A caller that also needs the sections renders them once and joins here, so a
 * request does not interpolate every context twice.
 * @param sections - sections from {@link renderContextSections}.
 * @returns the current full snapshot, or `''` when no context is active.
 */
export function joinContextSections(sections) {
    const body = sections.map(section => section.text).join('\n\n');
    if (body.length === 0)
        return '';
    return `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n${body}`;
}
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
export function renderContextSections(assembly) {
    return assembly.contexts
        .map(context => ({
        name: context.name,
        text: context.interpolate === false ? context.text : interpolate(context, assembly.variables, 'context'),
    }))
        .filter(section => section.text.length > 0);
}
/** Interpolate one section or context and attribute diagnostics to its owning input. */
function interpolate(input, variables, kind) {
    const text = input.text;
    let result = '';
    let last = 0;
    for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
        const group = GROUP_AT.exec(text.slice(open));
        if (group === null) {
            // A later closing brace makes this malformed; otherwise it is literal prose.
            if (text.indexOf('}}', open + 2) >= 0) {
                throw new Error(`malformed prompt variable reference at "${text.slice(open, open + 16)}…" in ${kind} "${input.name}" (references are complete simple {{name}} groups)`);
            }
            result += text.slice(last, open + 2);
            last = open + 2;
            continue;
        }
        // `{{}}` yields an empty name and follows the malformed-reference path.
        const name = group[0].slice(2, -2);
        if (!VARIABLE_NAME.test(name)) {
            throw new Error(`malformed prompt variable reference "{{${name}}}" in ${kind} "${input.name}" (variable names match ${String(VARIABLE_NAME)})`);
        }
        // Do not resolve unregistered names through Object.prototype.
        if (!Object.hasOwn(variables, name)) {
            const known = Object.keys(variables);
            throw new Error(`unknown prompt variable "{{${name}}}" in ${kind} "${input.name}"; registered variables: ${known.length > 0 ? known.join(', ') : '(none)'}`);
        }
        const value = variables[name];
        if (value === undefined) {
            throw new Error(`prompt variable "{{${name}}}" has no value for this assembly (${kind} "${input.name}")`);
        }
        result += text.slice(last, open) + value;
        last = open + group[0].length;
    }
    return result + text.slice(last);
}
/** Resolve one registered runtime fact without assembling sections or tools. */
function resolveContext(entry, context) {
    return {
        name: entry.name,
        text: typeof entry.text === 'function' ? entry.text(context) : entry.text,
        ...entry.interpolate !== undefined ? { interpolate: entry.interpolate } : {},
    };
}
/** All prompt registrations owned by one global or scoped layer. */
class PromptLayer {
    /** Same-name registrations in insertion order; disposal removes the exact entry. */
    sections = new Map();
    contexts;
    runtimeContextSuppressors = new AnonymousEntries();
    toolProviders = new AnonymousEntries();
    variables;
    /**
     * Create one prompt layer with diagnostics specific to its ownership scope.
     * @param scope - the scoped owner, or `undefined` for global registrations.
     */
    constructor(scope) {
        this.contexts = new NamedEntries(name => new Error(scope === undefined
            ? `prompt context "${name}" is already registered (for a per-agent override, register through that agent's \`agent.ctx\` instead)`
            : `prompt context "${name}" is already registered in this scope`));
        this.variables = new NamedEntries(name => new Error(scope === undefined
            ? `prompt variable "${name}" is already registered (for a per-agent value, register through that agent's \`agent.ctx\` instead)`
            : `prompt variable "${name}" is already registered in this scope`));
    }
    /** @returns whether this layer owns no prompt registrations. */
    isEmpty() {
        return this.sections.size === 0
            && this.contexts.isEmpty()
            && this.runtimeContextSuppressors.isEmpty()
            && this.toolProviders.isEmpty()
            && this.variables.isEmpty();
    }
}
/** Registry service for the prompt inputs assembled before each model step. */
export class SystemPrompt extends Service {
    static inject = ['sessionProjections'];
    static Config = z.object({
        includeHarnessIdentity: z.boolean().default(true),
        includeRuntimeContext: z.boolean().default(true),
        personaPrefix: z.string().default(''),
        personaSuffix: z.string().default(''),
        // Preserve omission because an explicit empty order lacks the rest marker.
        toolOrder: z.array(z.string()).default(undefined),
    });
    layers = new ScopedLayers(scope => new PromptLayer(scope), () => { this.ctx.emit('system-prompt/change'); });
    toolOrder;
    /** Orders disposals without retaining dead registrations in the shared registry. */
    retirementOrder = { next: 0 };
    /** Visible owners captured per Session, including disposed definitions awaiting admission. */
    sessionSources = new WeakMap();
    /** Initialized before dependent plugins activate. */
    admission;
    constructor(ctx, config) {
        super(ctx, 'systemPrompt');
        this.toolOrder = validateToolOrder(config.toolOrder);
        // Keep harness-owned openers independent of the selected loop plugin.
        if (config.includeHarnessIdentity ?? true) {
            this.section({
                name: 'harness:identity',
                order: this.getSectionOrder('HARNESS_IDENTITY'),
                text: 'You are an AI agent powered by DeepSeek Harness.',
            });
        }
        this.section({
            name: PERSONA_PREFIX_SECTION,
            order: this.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
            // The fallback narrows the optional input type; the schema already defaults it.
            text: config.personaPrefix ?? '',
        });
        this.section({
            name: PERSONA_SUFFIX_SECTION,
            order: this.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),
            text: config.personaSuffix ?? '',
        });
        if (!(config.includeRuntimeContext ?? true))
            this.suppressRuntimeContext();
    }
    async [Service.init]() {
        this.admission = await this.ctx.sessionProjections.register(sectionAdmissionsDefinition);
    }
    /**
     * Register a section; the nearest scope wins, then the latest registration
     * within that scope. Disposal reveals the next live definition. Retirement
     * is admitted only after no registration remains in the visible scope chain.
     * @param section - definition, canonical order and optional transition notices.
     * @returns the exact Cordis disposer; retirement is observed at later assembly.
     */
    section(section) {
        if (!Number.isFinite(section.order)) {
            throw new TypeError(`prompt section "${section.name}" order must be a finite number`);
        }
        if (section.retirement?.trim().length === 0) {
            throw new TypeError(`retirement for prompt section "${section.name}" requires nonempty literal text`);
        }
        const registration = { definition: section };
        const retirementOrder = this.retirementOrder;
        return this.layers.effect(this.ctx, (layer) => {
            const registrations = layer.sections.get(section.name) ?? [];
            layer.sections.set(section.name, registrations);
            registrations.push(registration);
            return () => {
                registration.disposedAt = retirementOrder.next++;
                registrations.splice(registrations.indexOf(registration), 1);
                if (registrations.length === 0)
                    layer.sections.delete(section.name);
            };
        }, { label: 'systemPrompt.section()' });
    }
    /**
     * Resolve the centrally owned placement of a repository prompt section.
     * @param name - stable section placement name.
     * @returns the section's numeric sort order.
     */
    getSectionOrder(name) {
        return SECTION_ORDERS[name];
    }
    /**
     * Resolve the centrally owned placement of a repository runtime context.
     * @param name - stable context placement name.
     * @returns the context's numeric sort order.
     */
    getContextOrder(name) {
        return CONTEXT_ORDERS[name];
    }
    /**
     * Register ordered dynamic context in the calling context's scope. Scoped
     * entries shadow global entries with the same name.
     * @param context - the context contribution to register.
     * @returns the exact Cordis effect disposer.
     */
    context(context) {
        if (!Number.isFinite(context.order)) {
            throw new TypeError(`prompt context "${context.name}" order must be a finite number`);
        }
        return this.layers.effect(this.ctx, layer => layer.contexts.insert(context.name, context), { label: 'systemPrompt.context()' });
    }
    /**
     * Suppress optional dynamic runtime-context contributions in the calling
     * context's scope without changing the services that own or enforce those
     * facts. Multiple suppressors remain independently disposable.
     * @returns the exact Cordis effect disposer.
     */
    suppressRuntimeContext() {
        return this.layers.effect(this.ctx, layer => layer.runtimeContextSuppressors.append(true), { label: 'systemPrompt.suppressRuntimeContext()' });
    }
    /**
     * Register a tool-schema provider in the calling context's scope. Global and
     * matching scoped providers both contribute; returning the reserved
     * {@link TOOL_ORDER_REST} name makes assembly fail.
     * @param provider - evaluated for each assembly with its context.
     * @returns the exact Cordis effect disposer.
     */
    tools(provider) {
        return this.layers.effect(this.ctx, layer => layer.toolProviders.append(provider), { label: 'systemPrompt.tools()' });
    }
    /**
     * Register a prompt variable in the calling context's scope. Scoped values
     * shadow globals; invalid or duplicate names throw. A provider may return
     * `undefined`, but rendering a section that references that value then fails.
     * @param name - the `[a-z][a-z0-9_]*` reference name.
     * @param provider - evaluated for each assembly.
     * @returns the exact Cordis effect disposer.
     */
    variable(name, provider) {
        if (!VARIABLE_NAME.test(name)) {
            throw new Error(`invalid prompt variable name "${name}" (must match ${String(VARIABLE_NAME)})`);
        }
        return this.layers.effect(this.ctx, layer => layer.variables.insert(name, provider), { label: 'systemPrompt.variable()' });
    }
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
    refreshContext(assembly, context = {}) {
        const providers = this.layers.merge(context.scope, layer => layer.contexts);
        const suppressed = !this.layers.global.runtimeContextSuppressors.isEmpty()
            || this.layers.chainLayers(context.scope).some(layer => !layer.runtimeContextSuppressors.isEmpty());
        const required = new Map([...providers].filter(([, entry]) => entry.required === true));
        const contexts = [];
        for (const accepted of assembly.contexts) {
            const provider = providers.get(accepted.name);
            required.delete(accepted.name);
            if (suppressed && provider?.required !== true)
                continue;
            contexts.push(provider === undefined ? accepted : resolveContext(provider, context));
        }
        for (const provider of required.values()) {
            const index = contexts.findIndex((entry) => {
                const next = providers.get(entry.name);
                return next !== undefined && next.order > provider.order;
            });
            contexts.splice(index < 0 ? contexts.length : index, 0, resolveContext(provider, context));
        }
        return { ...assembly, contexts };
    }
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
    async assemble(context = {}) {
        const scope = context.scope;
        // Committed names and provider values are captured before the waterfall can yield.
        const session = context.session;
        const committed = session === undefined ? undefined : this.admission.stateOf(session);
        const retained = context.session === undefined
            ? new Map()
            : this.sessionSources.get(context.session) ?? new Map();
        if (context.session !== undefined)
            this.sessionSources.set(context.session, retained);
        // Outer scopes are visited first; later registrations replace the effective definition.
        const scopeLayers = this.layers.chainLayers(scope);
        const visibleLayers = [this.layers.global, ...scopeLayers];
        const sectionByName = new Map();
        const visibleRegistrations = new Map();
        for (const layer of visibleLayers) {
            for (const [name, registrations] of layer.sections) {
                const inherited = visibleRegistrations.get(name) ?? [];
                visibleRegistrations.set(name, inherited.concat(registrations));
                for (const registration of registrations)
                    sectionByName.set(name, registration.definition);
            }
        }
        for (const [name, registrations] of visibleRegistrations) {
            retained.set(name, registrations);
        }
        const admittedNames = new Set(committed?.sections.map(section => section.name));
        for (const [name, registrations] of retained) {
            let retiredDefinition;
            let lastDisposal = -1;
            for (const registration of registrations) {
                const disposedAt = registration.disposedAt;
                if (disposedAt === undefined) {
                    // Any live owner keeps the logical source active, regardless of other disposals.
                    retiredDefinition = undefined;
                    break;
                }
                if (disposedAt > lastDisposal) {
                    retiredDefinition = registration.definition;
                    lastDisposal = disposedAt;
                }
            }
            if (retiredDefinition === undefined)
                continue;
            if (!admittedNames.has(name)) {
                retained.delete(name);
                continue;
            }
            sectionByName.set(name, {
                name,
                order: retiredDefinition.order,
                text: retiredDefinition.retirement ?? `The earlier instructions from ${name} no longer apply.`,
                interpolate: false,
                retire: true,
            });
        }
        const runtimeContextSuppressed = visibleLayers.some(layer => !layer.runtimeContextSuppressors.isEmpty());
        const variables = {};
        for (const layer of visibleLayers) {
            for (const [name, provider] of layer.variables.entries()) {
                variables[name] = provider(context);
            }
        }
        const contextByName = this.layers.merge(scope, layer => layer.contexts);
        // Keep all declared names for order validation, including tools restricted from this step.
        const providers = visibleLayers.flatMap(layer => [...layer.toolProviders.values()]);
        const collected = [];
        const knownNames = new Set();
        for (const provider of providers) {
            const result = provider(context);
            const schemas = result.schemas.map(({ name, description, parameters, deferLoading }) => ({
                name,
                description,
                parameters: structuredClone(parameters),
                ...deferLoading === true ? { deferLoading } : {},
            }));
            collected.push(...schemas);
            const acceptedKnownNames = result.knownNames ?? schemas.map(tool => tool.name);
            for (const name of acceptedKnownNames)
                knownNames.add(name);
        }
        const sectionDefinitions = [...sectionByName.values()].sort(comparePromptSections);
        const completeSections = sectionDefinitions.filter(section => section.complete === true);
        if (completeSections.length > 1) {
            throw new Error(`multiple complete prompt sections are active: ${completeSections.map(section => JSON.stringify(section.name)).join(', ')}`);
        }
        const sections = [];
        let completeSection;
        for (const section of sectionDefinitions) {
            const text = typeof section.text === 'function' ? section.text(context) : section.text;
            const assembled = { name: section.name, order: section.order, text };
            if (section.interpolate !== undefined)
                assembled.interpolate = section.interpolate;
            if (section.replacement !== undefined)
                assembled.replacement = section.replacement;
            if (section.retire !== undefined)
                assembled.retire = section.retire;
            if (section.complete !== undefined)
                assembled.complete = section.complete;
            if (section.complete === true)
                completeSection = { ...assembled };
            sections.push(assembled);
        }
        const tools = orderTools(collected, this.toolOrder, knownNames);
        const contexts = [...contextByName.values()]
            .filter(entry => !runtimeContextSuppressed || entry.required === true)
            .sort((a, b) => a.order - b.order)
            .map(entry => resolveContext(entry, context));
        const assembly = { sections, contexts, variables };
        const transformed = await this.ctx.waterfall(scopeTarget(this, scope), 'system-prompt/assemble', assembly, context, () => Promise.resolve(assembly));
        const presentation = {
            ...transformed,
            sections: [...transformed.sections].sort(comparePromptSections),
        };
        if (completeSection !== undefined) {
            // A registered complete prompt cannot be altered or supplemented by middleware.
            presentation.sections = [completeSection];
        }
        if (runtimeContextSuppressed) {
            const requiredNames = new Set([...contextByName.values()].filter(entry => entry.required === true).map(entry => entry.name));
            presentation.contexts = transformed.contexts.filter(entry => requiredNames.has(entry.name));
        }
        if (session === undefined) {
            return { ...presentation, tools, systemUpdates: () => [] };
        }
        const renderedSections = presentation.sections.map((section) => {
            const text = section.interpolate === false ? section.text : interpolate(section, presentation.variables, 'section');
            if (section.retire) {
                return { kind: 'retired', name: section.name, order: section.order, notice: text.trim(), complete: section.complete === true };
            }
            return {
                kind: 'active', name: section.name, order: section.order, text: text.trim(),
                replacement: section.replacement?.trim(), complete: section.complete === true,
            };
        });
        assertDistinctSections(renderedSections);
        return { ...presentation, tools, systemUpdates: retry => this.systemUpdates(session, renderedSections, retry) };
    }
    /** Writes that bring a Session's committed sections to one assembly's captured sections. */
    systemUpdates(session, sections, retry) {
        const state = this.admission.stateOf(session);
        // System changes that another writer logs between attempts wait for the next assembly.
        if (retry && !state.needsRebuild)
            return [];
        const admission = assembleSystemAdmission(state, sections);
        if (admission.kind === 'append') {
            // The first commitment reserves a system head even without instructions.
            const messages = admission.messages.length === 0 && session.surface.nodes.length === 0
                ? [createMessage({ role: 'system', content: [], source: { kind: 'system-prompt', sections: [] } })]
                : admission.messages;
            return messages.map(message => ({ message, intent: { surfaceOp: 'append' } }));
        }
        const [head, ...additions] = session.surface.systemNodes;
        const updates = [];
        for (const { seq, isEmpty } of additions) {
            if (isEmpty)
                continue;
            const message = createMessage({
                role: 'system', content: [], source: { kind: 'system-prompt', sections: [] },
            });
            updates.push({ message, intent: { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] } });
        }
        // A head reset completes recovery; write it last so interrupted cleanup stays pending.
        updates.push({ message: admission.message, intent: head === undefined
                ? { surfaceOp: 'append' }
                : { surfaceOp: { op: 'replace', startSeq: head.seq, endSeq: head.seq }, sourceEventSeqs: [head.seq] } });
        return updates;
    }
}
export default SystemPrompt;
//# sourceMappingURL=index.js.map