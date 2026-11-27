/** System admissions built from captured contributions and committed state. */
import { createMessage } from '@deepseek-ai/dsh-llm';
function parts() {
    return { content: [], sections: [] };
}
/** Each contribution occupies one trimmed text block; adapters own separators. */
function appendText(target, text) {
    const index = target.content.length;
    target.content.push({ type: 'text', text: text.trim() });
    return index;
}
function appendSection(target, section, notice) {
    const noticeIndex = notice !== undefined && notice.length > 0 ? [appendText(target, notice)] : undefined;
    target.sections.push({
        name: section.name,
        order: section.order,
        state: 'active',
        contentIndex: appendText(target, section.text),
        ...noticeIndex === undefined ? {} : { noticeIndex },
    });
}
function appendRetirement(target, section) {
    target.sections.push({
        name: section.name,
        state: 'retired',
        noticeIndex: [appendText(target, section.notice)],
    });
}
function supersession(complete, hasInstructions) {
    if (!hasInstructions)
        return 'From this point onward, none of the earlier system-prompt sections apply.';
    if (complete)
        return 'From this point onward, the following complete system prompt replaces all earlier system-prompt sections.';
    return 'From this point onward, the following system-prompt sections replace all earlier system-prompt sections.';
}
/**
 * Reject contributions that cannot be attributed to one named source.
 * @param sections - normalized contributions from one assembly.
 */
export function assertDistinctSections(sections) {
    const names = new Set();
    for (const section of sections) {
        if (section.name.length === 0)
            throw new Error('assembled prompt section name must be nonempty');
        if (names.has(section.name))
            throw new Error(`duplicate assembled prompt section "${section.name}"`);
        names.add(section.name);
    }
}
/**
 * Compare captured source values with the committed state.
 * @param state - committed sections at the time of comparison.
 * @param sections - normalized, distinctly named contributions from one assembly.
 * @returns append deltas or one rebuilt head; none once the same contributions are committed.
 */
export function assembleSystemAdmission(state, sections) {
    const previous = new Map(state.sections.map(section => [section.name, section]));
    const eligibleSections = sections.filter(section => section.kind !== 'retired' || previous.has(section.name));
    const complete = sections.some(section => section.complete);
    if (state.needsRebuild) {
        return { kind: 'rebuild', message: rebuildSystemPrompt(previous, eligibleSections, complete) };
    }
    if (complete !== state.complete) {
        return { kind: 'append', messages: [replaceSystemPrompt(state, sections, eligibleSections)] };
    }
    const updates = [];
    for (const section of eligibleSections) {
        const committed = previous.get(section.name);
        if (section.kind === 'retired') {
            updates.push(section);
            continue;
        }
        if (committed === undefined) {
            if (complete || section.text.length > 0)
                updates.push(section);
            continue;
        }
        if (committed.text !== section.text || committed.order !== section.order)
            updates.push(section);
    }
    if (updates.length === 0)
        return { kind: 'append', messages: [] };
    if (complete) {
        return { kind: 'append', messages: [replaceSystemPrompt(state, sections, updates)] };
    }
    const result = parts();
    for (const section of updates) {
        if (section.kind === 'retired') {
            appendRetirement(result, section);
            continue;
        }
        const committed = previous.get(section.name);
        if (committed === undefined || committed.text === section.text) {
            // New sections and order-only updates need no replacement notice.
            appendSection(result, section);
            continue;
        }
        let notice = section.replacement;
        if (notice === undefined) {
            notice = section.text.length === 0
                ? `The earlier instructions from ${section.name} no longer apply.`
                : `The following replaces the earlier instructions from ${section.name}.`;
        }
        appendSection(result, section, notice);
    }
    return { kind: 'append', messages: [createMessage({
                role: 'system',
                content: result.content,
                source: { kind: 'system-prompt', sections: result.sections },
            })] };
}
/**
 * A whole-prompt replacement uses the full presentation for its supersession notice.
 * The selected contributions supply its attributed blocks; uncommitted retirements are already excluded.
 */
function replaceSystemPrompt(state, presentation, contributions) {
    const result = parts();
    const complete = presentation.some(section => section.complete);
    if (state.sections.length > 0) {
        appendText(result, supersession(complete, presentation.some(section => section.kind === 'active' && section.text.length > 0)));
    }
    for (const section of contributions) {
        if (section.kind === 'retired') {
            appendRetirement(result, section);
            continue;
        }
        if (complete || section.text.length > 0)
            appendSection(result, section);
    }
    return createMessage({
        role: 'system',
        content: result.content,
        source: { kind: 'system-prompt', sections: result.sections, reset: true, ...complete ? { complete: true } : {} },
    });
}
/** Rebuild only effective instructions; prior notices disappear with the old system nodes. */
function rebuildSystemPrompt(previous, eligibleSections, complete) {
    const result = parts();
    for (const section of eligibleSections) {
        if (section.kind === 'retired')
            continue;
        if (complete || section.text.length > 0 || previous.has(section.name))
            appendSection(result, section);
    }
    return createMessage({
        role: 'system', content: result.content,
        source: { kind: 'system-prompt', sections: result.sections, reset: true, ...complete ? { complete: true } : {} },
    });
}
//# sourceMappingURL=admission.js.map