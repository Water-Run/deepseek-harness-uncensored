/** DeepSeek `GET /models` listing: one authenticated request and per-entry decoding. */
import { APP_IDENTITY, attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm';
import { timeoutOf } from '@deepseek-ai/dsh-timeout';
const LISTED_MODALITIES = ['text', 'image'];
const BADGE_TONES = ['neutral', 'info', 'success', 'warning'];
const LANGUAGE_ID = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u;
const UNREADABLE_BADGE_CHARACTER = /[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/u;
const VISIBLE_BADGE_CHARACTER = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}]/u;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** Longest badge text this build displays, in user-perceived characters, for every translation. */
export const MAX_BADGE_TEXT_LENGTH = 12;
/** Code of a listing deadline's timeout reason; {@link requestModelListing} reports it as `TIMEOUT`. */
export const LISTING_TIMEOUT = 'MODEL_LISTING_TIMEOUT';
/**
 * The listing endpoint of a Messages root.
 * @param baseURL - Messages `baseURL`.
 * @returns `/models` at the origin of `baseURL`, the only origin that receives the route's credential.
 */
export function modelListingURL(baseURL) {
    return new URL('/models', new URL(baseURL).origin).href;
}
function fieldsOf(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
/** Listed modalities this build sends, in listing order without repeats; `undefined` when the value is not an array. */
function knownModalities(value) {
    if (!Array.isArray(value))
        return undefined;
    const listed = value;
    return LISTED_MODALITIES.filter(modality => listed.includes(modality))
        .toSorted((left, right) => listed.indexOf(left) - listed.indexOf(right));
}
/** A declared capacity: `undefined` when absent, `false` when not a positive safe integer. */
function capacity(value) {
    if (value === undefined)
        return undefined;
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : false;
}
function requirementOf(entry) {
    if (entry.client_requirements === undefined)
        return { kind: 'none' };
    const requirements = fieldsOf(entry.client_requirements);
    if (requirements === undefined)
        return { kind: 'invalid' };
    const declared = requirements[APP_IDENTITY.product];
    if (declared === undefined)
        return { kind: 'none' };
    const own = fieldsOf(declared);
    if (own === undefined)
        return { kind: 'invalid' };
    if (own.min_version === undefined)
        return { kind: 'none' };
    return typeof own.min_version === 'string' && own.min_version.length > 0
        ? { kind: 'min-version', version: own.min_version }
        : { kind: 'invalid' };
}
/** One trimmed, visible badge text on one line, without control characters and at most {@link MAX_BADGE_TEXT_LENGTH} graphemes. */
function badgeText(value) {
    if (typeof value !== 'string')
        return undefined;
    const text = value.trim();
    const length = Array.from(GRAPHEMES.segment(text)).length;
    return length <= MAX_BADGE_TEXT_LENGTH && VISIBLE_BADGE_CHARACTER.test(text) && !UNREADABLE_BADGE_CHARACTER.test(value)
        ? text : undefined;
}
/** A literal badge text, or translations keyed by lowercase language id that include English. */
function localizedBadgeText(value) {
    if (typeof value === 'string')
        return badgeText(value);
    const variants = fieldsOf(value);
    if (variants === undefined)
        return undefined;
    const texts = [];
    for (const [language, variant] of Object.entries(variants)) {
        const text = badgeText(variant);
        if (!LANGUAGE_ID.test(language) || text === undefined)
            return undefined;
        texts.push([language, text]);
    }
    const translations = Object.fromEntries(texts);
    const en = translations.en;
    return en === undefined ? undefined : { ...translations, en };
}
/** This client's entry in a listing entry's `client_metadata`, as diagnostics name it. */
const OWN_METADATA = `client_metadata["${APP_IDENTITY.product}"]`;
/** An optional object field: `undefined` when absent or `null`, `false` when it is not an object. */
function optionalFields(value) {
    return value === undefined || value === null ? undefined : fieldsOf(value) ?? false;
}
function badgeOf(entry) {
    // `null` at any level declares no badge, like an absent field; this build ships none to fall back on.
    const metadata = optionalFields(entry.client_metadata);
    if (metadata === false)
        return { kind: 'invalid', reason: 'client_metadata is not an object' };
    const own = optionalFields(metadata?.[APP_IDENTITY.product]);
    if (own === false)
        return { kind: 'invalid', reason: `${OWN_METADATA} is not an object` };
    const declared = optionalFields(own?.badge);
    if (declared === false)
        return { kind: 'invalid', reason: `${OWN_METADATA}.badge is not an object` };
    if (declared === undefined)
        return undefined;
    const text = localizedBadgeText(declared.text);
    if (text === undefined) {
        return {
            kind: 'invalid',
            reason: `${OWN_METADATA}.badge.text is not a string or an object of lowercase language ids including "en", `
                + `each text 1 to ${MAX_BADGE_TEXT_LENGTH} characters on one line`,
        };
    }
    // An absent or unrecognized tone keeps the text at the least emphasis.
    const tone = BADGE_TONES.find(candidate => candidate === declared.tone) ?? 'neutral';
    return { kind: 'badge', badge: { text, tone } };
}
function capabilitiesOf(entry) {
    const messages = fieldsOf(fieldsOf(entry.api_capabilities)?.anthropic_messages);
    if (messages === undefined)
        return { usable: false, reason: 'declares no api_capabilities.anthropic_messages' };
    const outputs = entry.output_modalities === undefined ? ['text'] : knownModalities(entry.output_modalities);
    if (outputs?.includes('text') !== true)
        return { usable: false, reason: 'declares no text output' };
    const inputs = entry.input_modalities === undefined ? ['text'] : knownModalities(entry.input_modalities);
    if (inputs === undefined || inputs.length === 0)
        return { usable: false, reason: 'declares no input modality DeepSeek Harness supports' };
    const contextWindow = capacity(entry.context_window);
    const maxOutputTokens = capacity(entry.max_output_tokens);
    if (contextWindow === false || maxOutputTokens === false) {
        return { usable: false, reason: 'declares an invalid context_window or max_output_tokens' };
    }
    // `null` declares nothing, like an absent field, so a serializer that writes empty values as null keeps this build's knowledge.
    const promptUpdate = messages.system_prompt_update ?? undefined;
    const toolUpdate = messages.tool_update ?? undefined;
    return {
        usable: true,
        facts: {
            inputModalities: inputs,
            ...contextWindow === undefined ? {} : { contextWindow },
            ...maxOutputTokens === undefined ? {} : { maxOutputTokens },
            ...promptUpdate === undefined ? {} : { systemPromptUpdate: promptUpdate === 'in-history' ? 'in-history' : 'leading-only' },
            ...toolUpdate === undefined ? {} : {
                toolUpdate: toolUpdate === 'in-history' || toolUpdate === 'addition-only' ? toolUpdate : 'leading-only',
            },
        },
    };
}
/**
 * Decode one `/models` body entry by entry.
 * @param body - parsed JSON response.
 * @returns the entries with a usable id, in listing order.
 * @throws LlmError `INVALID_RESPONSE` when the body has no `data` array or no usable entry.
 */
export function parseModelListing(body) {
    const data = fieldsOf(body)?.data;
    if (!Array.isArray(data))
        throw new LlmError('DeepSeek model listing has no "data" array', 'INVALID_RESPONSE');
    const rows = data;
    const entries = [];
    const seen = new Set();
    for (const row of rows) {
        const entry = fieldsOf(row);
        const id = entry?.id;
        if (entry === undefined || typeof id !== 'string' || id.length === 0 || seen.has(id))
            continue;
        seen.add(id);
        const badge = badgeOf(entry);
        entries.push({
            id,
            ...typeof entry.name === 'string' && entry.name.length > 0 ? { name: entry.name } : {},
            requirement: requirementOf(entry),
            capabilities: capabilitiesOf(entry),
            ...badge === undefined ? {} : { badge },
        });
    }
    if (entries.length === 0)
        throw new LlmError('DeepSeek model listing contains no model entry', 'INVALID_RESPONSE');
    return { entries, skipped: rows.length - entries.length };
}
/**
 * Request and decode one model listing. Redirects fail, so credentials stay on the requested origin.
 * @param url - listing endpoint.
 * @param headers - authentication headers for this endpoint.
 * @param signal - cancellation and deadline of the whole exchange.
 * @returns the decoded listing.
 * @throws LlmError `TIMEOUT` when a {@link LISTING_TIMEOUT} deadline elapses before a complete body, `ABORTED` for
 *   another abort, `TRANSPORT` for a network failure, `HTTP_<status>` for a non-2xx answer,
 *   and `INVALID_RESPONSE` for a body that is not a JSON listing.
 */
export async function requestModelListing(url, headers, signal) {
    let response;
    let text;
    try {
        response = await fetch(url, {
            method: 'GET', redirect: 'error', signal,
            headers: { ...attributionHeaders(), accept: 'application/json', ...headers },
        });
        text = await response.text();
    }
    catch (error) {
        const expired = timeoutOf(signal, LISTING_TIMEOUT);
        if (expired !== undefined) {
            throw new LlmError(`DeepSeek model listing request to ${url} timed out after ${expired.timeoutMs} ms`, 'TIMEOUT', { cause: error });
        }
        throw signal.aborted
            ? new LlmError(`DeepSeek model listing request to ${url} was aborted`, 'ABORTED', { cause: error })
            : new LlmError(`could not reach ${url}`, 'TRANSPORT', { cause: error });
    }
    if (!response.ok)
        throw new LlmError(`${url} answered HTTP ${response.status}`, `HTTP_${response.status}`, { status: response.status });
    let body;
    try {
        body = JSON.parse(text);
    }
    catch (error) {
        throw new LlmError(`${url} did not answer with JSON`, 'INVALID_RESPONSE', { cause: error });
    }
    return parseModelListing(body);
}
//# sourceMappingURL=listing.js.map