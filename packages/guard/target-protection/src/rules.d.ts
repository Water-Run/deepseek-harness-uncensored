import type { NetworkTarget, RuleAddresses, TargetDecision, TargetEffect, TargetPreferences, TargetRule, FlatTargetRule } from './types.ts';
/**
 * Normalize a host field. URLs, ports and credentials must use their separate fields.
 * @param value - Hostname or IPv4/IPv6 literal, optionally with URL IPv6 brackets.
 * @returns ASCII lower-case hostname or canonical IP, mapping IPv4-in-IPv6 to IPv4.
 */
export declare function canonicalTargetHost(value: string): string;
/**
 * Normalize DNS labels without interpreting a numeric name as a URL IPv4 shorthand.
 * @param value - DNS record owner or alias name.
 * @returns Lower-case ASCII DNS name without a trailing root separator.
 */
export declare function canonicalDnsName(value: string): string;
/**
 * Validate a complete wire/file value and compile all rules before accepting it.
 * @param input - Untrusted configuration data.
 * @returns Credential-free normalized settings with no shared caller-owned objects.
 */
export declare function parseTargetPreferences(input: unknown): TargetPreferences;
/**
 * Expand validated resource selectors while sharing one immutable policy and rule ID.
 * @param preferences - Parsed owner preferences.
 * @returns Independent flat records; network qualifiers never leak into a path alias.
 */
export declare function expandTargetRules(preferences: TargetPreferences): FlatTargetRule[];
/**
 * Identify an explicitly named test-server endpoint before allowing private-address resolution.
 * @param preferences - Validated owner rules; aliases inherit their resource policy.
 * @param hostname - Requested canonical hostname or literal IP, not a resolved alias.
 * @param port - Actual service port.
 * @returns Whether a matching enabled test-server selector permits private resolution; production checks still apply separately.
 */
export declare function hasExactTestServer(preferences: TargetPreferences, hostname: string, port: number): boolean;
/** Compiled immutable selection; every decision receives fresh transport and DNS facts. */
export declare class TargetRules {
    private readonly entries;
    private readonly preferences;
    /**
     * @param input - Complete settings, copied and validated before use.
     */
    constructor(input: TargetPreferences);
    /**
     * Return exact production names whose address aliases require fresh DNS resolution.
     * @param target - When supplied, omit selectors whose port or database cannot match; omission returns all active selectors.
     * @returns Applicable hostname selectors; literals need no resolver.
     */
    namedHosts(target?: NetworkTarget): readonly TargetRule[];
    /**
     * Refuse a definite full-production name before resolving the requested target.
     * @param target - Logical request identity; unresolved addresses are permitted here.
     * @returns A definite denial, or undefined when final address-aware validation remains necessary.
     */
    preflight(target: NetworkTarget): TargetDecision | undefined;
    /**
     * Evaluate every supplied target together; any production denial wins over all test exceptions.
     * @param targets - Verified executor identities, including all pinned addresses and DNS aliases.
     * @param effect - Effect guaranteed by the actual operation, never a model classification.
     * @param bindings - Fresh DNS bindings keyed by canonical hostname; missing/failed entries remain unknown.
     * @returns Permission or stable refusal with matching rule IDs.
     */
    decide(targets: readonly NetworkTarget[], effect: TargetEffect, bindings: RuleAddresses): TargetDecision;
}
//# sourceMappingURL=rules.d.ts.map