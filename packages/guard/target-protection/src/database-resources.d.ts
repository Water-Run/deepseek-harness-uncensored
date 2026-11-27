import { z } from 'zod';
import type { TargetRuleId, TargetSnapshot } from './types.ts';
/** Owner association; server resources cover the endpoint, database resources additionally bind its startup database. */
export interface DatabaseResourceBinding {
    /** Central server or database resource whose policy applies to this endpoint. */
    readonly ruleId: TargetRuleId;
    /** Configured protocol hostname, independently checked by TLS. */
    readonly hostname: string;
    /** Native database service port. */
    readonly port: number;
    /** Startup database, verified before application queries. */
    readonly database: string;
}
/** Parse an optional configured central resource UUID before provider activation. */
export declare const databaseResourceId: z.ZodPipe<z.ZodUUID, z.ZodTransform<TargetRuleId, string>>;
/**
 * Add endpoint aliases to a rule snapshot without changing its persisted resources or revision.
 * Existing selectors remain authoritative; references must name server or database resources even when disabled.
 * @param snapshot - The current central policy.
 * @param bindings - Owner-configured endpoint associations, independent of model requests.
 * @returns The same snapshot without associations, otherwise a snapshot containing the additional network aliases.
 * @throws TARGET_IDENTITY_UNVERIFIED when a referenced resource is missing or is a domain resource.
 */
export declare function projectDatabaseResources(snapshot: TargetSnapshot, bindings: readonly DatabaseResourceBinding[]): TargetSnapshot;
//# sourceMappingURL=database-resources.d.ts.map