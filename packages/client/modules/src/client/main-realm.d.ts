/** Initial execution environment supplied by the module system's startup carrier. */
import type { ScriptRealm } from '@deepseek-ai/dsh-client-script-realm/client';
/** Owns execution requests without assuming the carrier has a browser document. */
export declare class MainScriptRealm implements Pick<ScriptRealm, 'id' | 'execute' | 'dispose'> {
    private readonly loadBundle;
    readonly id: ScriptRealm["id"];
    private readonly pending;
    private closed;
    private disposal;
    /** @param loadBundle - Carrier execution hook; absent selects the existing page transport. */
    constructor(loadBundle?: (url: string) => Promise<void>);
    /** @param script - Script requested by Modules. @returns The carrier's execution completion. */
    execute(script: Parameters<ScriptRealm['execute']>[0]): Promise<void>;
    /** Stop accepting requests and await existing carrier operations without cancelling them. */
    dispose(): Promise<void>;
}
//# sourceMappingURL=main-realm.d.ts.map