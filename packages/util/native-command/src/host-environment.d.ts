/** Injectable process and kernel facts; detection does not establish desktop availability. */
export interface HostEnvironmentFacts {
    platform?: string;
    env?: NodeJS.ProcessEnv;
    osRelease?: string;
}
/**
 * Identify a Linux process running under Windows Subsystem for Linux.
 * @param facts Process and kernel facts; omitted fields use the current Host.
 * @returns Whether WSL markers are present on a Linux Host, even when interoperation is disabled.
 */
export declare function isWsl(facts?: HostEnvironmentFacts): boolean;
//# sourceMappingURL=host-environment.d.ts.map