/** Bind owner-selected database resources to configured native protocol endpoints. @module */
import { brandString } from '@deepseek-ai/dsh-brand';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { z } from 'zod';
import { canonicalTargetHost, parseTargetPreferences } from "./rules.js";
/** Parse an optional configured central resource UUID before provider activation. */
export const databaseResourceId = z.uuid().transform(value => brandString(value));
/**
 * Add endpoint aliases to a rule snapshot without changing its persisted resources or revision.
 * Existing selectors remain authoritative; references must name server or database resources even when disabled.
 * @param snapshot - The current central policy.
 * @param bindings - Owner-configured endpoint associations, independent of model requests.
 * @returns The same snapshot without associations, otherwise a snapshot containing the additional network aliases.
 * @throws TARGET_IDENTITY_UNVERIFIED when a referenced resource is missing or is a domain resource.
 */
export function projectDatabaseResources(snapshot, bindings) {
    if (bindings.length === 0)
        return snapshot;
    const aliases = new Map();
    for (const binding of bindings) {
        const rule = snapshot.preferences.rules.find(rule => rule.id === binding.ruleId);
        if (rule === undefined || rule.kind === 'domain') {
            throw new HarnessError('A database binding does not name a central server or database resource. Check its resource IDs.', 'TARGET_IDENTITY_UNVERIFIED');
        }
        const selector = { match: 'host', address: canonicalTargetHost(binding.hostname), port: binding.port,
            ...rule.kind === 'database' ? { database: binding.database } : {} };
        const existing = aliases.get(rule.id) ?? [];
        if (![rule, ...rule.aliases ?? [], ...existing].some(item => item.match === selector.match && item.address === selector.address
            && item.port === selector.port && item.database === selector.database))
            existing.push(selector);
        aliases.set(rule.id, existing);
    }
    return { ...snapshot, preferences: parseTargetPreferences({ ...snapshot.preferences, rules: snapshot.preferences.rules.map((rule) => {
                const additional = aliases.get(rule.id);
                return additional?.length ? { ...rule, aliases: [...rule.aliases ?? [], ...additional] } : rule;
            }) }) };
}
//# sourceMappingURL=database-resources.js.map