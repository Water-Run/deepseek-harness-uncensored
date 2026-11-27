/** System admissions built from captured contributions and committed state. */
import type { SystemMessage } from '@deepseek-ai/dsh-llm';
import type { CommittedSection, SectionAdmissions } from './projection.ts';
/** Captured instruction text, distinct from a source's retirement notice. */
export type RenderedSection = (CommittedSection & {
    readonly kind: 'active';
    readonly replacement: string | undefined;
    readonly complete: boolean;
}) | {
    readonly kind: 'retired';
    readonly name: string;
    readonly order: number;
    readonly notice: string;
    readonly complete: boolean;
};
/** Operation that brings committed state to the captured contributions. */
export type SystemAdmission = {
    readonly kind: 'append';
    readonly messages: readonly SystemMessage[];
} | {
    readonly kind: 'rebuild';
    readonly message: SystemMessage;
};
/**
 * Reject contributions that cannot be attributed to one named source.
 * @param sections - normalized contributions from one assembly.
 */
export declare function assertDistinctSections(sections: readonly RenderedSection[]): void;
/**
 * Compare captured source values with the committed state.
 * @param state - committed sections at the time of comparison.
 * @param sections - normalized, distinctly named contributions from one assembly.
 * @returns append deltas or one rebuilt head; none once the same contributions are committed.
 */
export declare function assembleSystemAdmission(state: SectionAdmissions, sections: readonly RenderedSection[]): SystemAdmission;
//# sourceMappingURL=admission.d.ts.map