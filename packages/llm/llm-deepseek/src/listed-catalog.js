/** A listed catalog: version gating, this build's model knowledge, and deployment overrides. */
import semver from 'semver';
import { APP_IDENTITY, LlmError } from '@deepseek-ai/dsh-llm';
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { resolveAdapterOptions } from "./config.js";
/** Replace fields of an entry; a text-only result drops the image limits it inherited. */
function layered(model, layer) {
    const merged = { ...model, ...layer };
    if (merged.inputModalities?.includes('image') !== true) {
        if (layer.imagePixelBudget === undefined)
            delete merged.imagePixelBudget;
        if (layer.imageTargetBytes === undefined)
            delete merged.imageTargetBytes;
    }
    return merged;
}
/** Layer one usable listing entry over this build's entry for the same id; a declared `leading-only` mode removes the inherited one. */
function listed(base, entry, facts, routeMaxTokens) {
    const { systemPromptUpdate, toolUpdate, ...rest } = base;
    const inherited = {
        ...rest,
        ...systemPromptUpdate === undefined || facts.systemPromptUpdate === 'leading-only' ? {} : { systemPromptUpdate },
        ...toolUpdate === undefined || facts.toolUpdate === 'leading-only' ? {} : { toolUpdate },
    };
    return layered(inherited, {
        ...entry.name === undefined ? {} : { name: entry.name },
        ...facts.contextWindow === undefined ? {} : { contextWindow: facts.contextWindow },
        ...facts.maxOutputTokens === undefined ? {} : { maxTokens: Math.min(routeMaxTokens, facts.maxOutputTokens) },
        ...facts.systemPromptUpdate === 'in-history' ? { systemPromptUpdate: 'in-history' } : {},
        ...facts.toolUpdate === undefined || facts.toolUpdate === 'leading-only' ? {} : { toolUpdate: facts.toolUpdate },
        inputModalities: [...facts.inputModalities],
    });
}
function gateOf(entry, known, clientVersion, problems) {
    const requirement = entry.requirement;
    switch (requirement.kind) {
        case 'none':
            return known ? undefined : { kind: 'unsupported' };
        case 'min-version':
            if (semver.valid(requirement.version) === null)
                break;
            return semver.gte(clientVersion, requirement.version)
                ? undefined
                : { kind: 'upgrade-required', requiredVersion: requirement.version };
        case 'invalid':
            break;
        /* v8 ignore next 2 -- listing decoding produces only the closed requirement union */
        default:
            return assertNever(requirement, 'model listing client requirement');
    }
    problems.push(`model "${entry.id}" declares an unreadable client requirement`);
    return { kind: 'unsupported' };
}
/**
 * Resolve a route's catalog from its listing. A declared minimum client version decides a
 * listed model's availability; without one, only models this build supports
 * are offered and the other listed models stay hidden.
 * @param input - listing, supported models, overrides, route cap, and this build's version.
 * @returns offered models, request-resolution entries, refusals, and diagnostics.
 */
export function resolveListedCatalog(input) {
    const visible = (model) => !input.visibleModels?.length || input.visibleModels.includes(model.id);
    const supported = new Map(input.supported.map(model => [model.id, model]));
    const problems = [];
    const overrideErrors = [];
    const withOverride = (model) => {
        const override = input.overrides[model.id];
        if (override === undefined)
            return model;
        const candidate = layered(model, override);
        try {
            resolveAdapterOptions({ models: [candidate] });
        }
        catch (error) {
            overrideErrors.push(`modelOverrides.${model.id} does not apply (${String(error)})`);
            return model;
        }
        return candidate;
    };
    if (input.listing === undefined) {
        const resolution = resolveAdapterOptions({ models: input.supported.map(withOverride) }).models;
        return { offered: resolution.filter(visible), resolution, refusals: new Map(), badges: new Map(), problems, overrideErrors };
    }
    const offered = [];
    const refusals = new Map();
    const badges = new Map();
    for (const entry of input.listing) {
        const refusal = gateOf(entry, supported.has(entry.id), input.clientVersion, problems);
        if (refusal !== undefined) {
            refusals.set(entry.id, refusal);
            continue;
        }
        if (!entry.capabilities.usable) {
            problems.push(`model "${entry.id}" ${entry.capabilities.reason}`);
            refusals.set(entry.id, { kind: 'unsupported' });
            continue;
        }
        offered.push(withOverride(listed(supported.get(entry.id) ?? { id: entry.id }, entry, entry.capabilities.facts, input.routeMaxTokens)));
        const badge = entry.badge;
        switch (badge?.kind) {
            case undefined:
                break;
            case 'badge':
                badges.set(entry.id, badge.badge);
                break;
            case 'invalid':
                problems.push(`model "${entry.id}" shows no badge: ${badge.reason}`);
                break;
            /* v8 ignore next 2 -- listing decoding produces only the closed badge union */
            default:
                assertNever(badge, 'listed badge');
        }
    }
    const offeredIds = new Set(offered.map(model => model.id));
    const listedIds = new Set(input.listing.map(entry => entry.id));
    for (const id of Object.keys(input.overrides)) {
        if (!listedIds.has(id) && !supported.has(id)) {
            overrideErrors.push(`modelOverrides names "${id}", which neither the model listing nor the built-in catalog describes`);
        }
    }
    const resolution = resolveAdapterOptions({
        models: [...offered, ...input.supported.filter(model => !offeredIds.has(model.id)).map(withOverride)],
    }).models;
    return { offered: resolution.slice(0, offered.length).filter(visible), resolution, refusals, badges, problems, overrideErrors };
}
/**
 * Refuse a listed model this build cannot serve, before any network I/O.
 * @param model - requested wire model id.
 * @param refusal - the catalog's refusal for `model`, or `undefined` when it is admitted.
 * @throws LlmError `CLIENT_UPGRADE_REQUIRED` naming the required and current versions, or `MODEL_UNSUPPORTED`.
 */
export function refuseListedModel(model, refusal) {
    if (refusal === undefined)
        return;
    switch (refusal.kind) {
        case 'upgrade-required':
            throw new LlmError(`DeepSeek model "${model}" requires DeepSeek Harness ${refusal.requiredVersion} or later; current version is ${APP_IDENTITY.version}`, 'CLIENT_UPGRADE_REQUIRED');
        case 'unsupported':
            throw new LlmError(`DeepSeek model "${model}" is not supported by DeepSeek Harness; current version is ${APP_IDENTITY.version}`, 'MODEL_UNSUPPORTED');
        /* v8 ignore next 2 -- catalog resolution produces only the closed refusal union */
        default:
            assertNever(refusal, 'listed catalog refusal');
    }
}
//# sourceMappingURL=listed-catalog.js.map