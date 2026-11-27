/** Committed system sections and pending compaction recovery folded from the Session log. */
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
/** Effective instructions contributed by one source. */
export interface CommittedSection {
    readonly name: string;
    readonly order: number;
    readonly text: string;
}
/** Committed system instructions recovered from the Session log. */
export interface SectionAdmissions {
    readonly sections: readonly CommittedSection[];
    readonly complete: boolean;
    /** Whether a compaction or a system message without `source.sections` still requires a full reset. */
    readonly needsRebuild: boolean;
}
/** Host-only effective sections, owned by the system-prompt service. */
export declare const sectionAdmissionsDefinition: ProjectionDefinition<'systemSections', SectionAdmissions>;
//# sourceMappingURL=projection.d.ts.map