/**
 * The Remote surface of the security-mode egress proxy: settings, connection
 * check, and the bounded traffic list/detail the settings panel renders.
 *
 * Mutations and captured exchanges require the application owner. Status reads
 * report upstream password presence without returning the secret.
 * @module @deepseek-ai/dsh-security-proxy-local/service
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { SecurityProxyCaptureStats, SecurityProxyCaptureExport, SecurityProxyExportQuery, SecurityProxyFlowDetail, SecurityProxyFlowQuery, SecurityProxyFlowsResult, SecurityProxySettingsPatch, SecurityProxyState, SecurityProxyTestResult } from '@deepseek-ai/dsh-security-proxy/types';
import type { SecurityProxyEgressLease } from '@deepseek-ai/dsh-security-proxy';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WebFetchResult } from '@deepseek-ai/dsh-web';
import type { SecurityProxyEngine } from './engine.ts';
/**
 * Host service consumed by tools in-process and by the settings panel over the
 * Remote gateway. One instance serves the whole Host.
 */
export declare class SecurityProxyService extends TypertRemoteService {
    private readonly engine;
    /**
     * @param ctx - owning context; the service registers as `ctx.securityProxy`.
     * @param engine - the proxy runtime this service fronts.
     */
    constructor(ctx: Context, engine: SecurityProxyEngine);
    /**
     * Resolve whether one tool execution is routed through the proxy.
     * @param agent - the executing Agent.
     * @param tool - the model-facing tool name.
     * @returns the route, or undefined when the session is not covered.
     */
    route(agent: Agent | undefined, tool: string): {
        sessionId: SessionId;
        preset: string;
        tool: string;
    } | undefined;
    /**
     * Environment for one child process in a covered session.
     * @param agent - the executing Agent.
     * @param tool - the model-facing tool name.
     * @returns the overlay, or undefined when the session is not covered.
     */
    environment(agent: Agent | undefined, tool: string): Promise<Readonly<Record<string, string>> | undefined>;
    /**
     * Retain native forwarding and capture under the executing conversation.
     * @param agent - Executing Agent; absence acquires nothing.
     * @param tool - Traffic attribution.
     * @param stop - Join delegated resources after cancellation.
     * @param signal - Caller lifetime.
     * @param admission - Optional cancellation during startup only; omitted for caller lifetime alone.
     * @returns Covered execution lease, or undefined outside enabled Security mode.
     */
    openEgress(agent: Agent | undefined, tool: string, stop: () => Promise<void>, signal: AbortSignal, admission?: AbortSignal): Promise<SecurityProxyEgressLease | undefined>;
    /**
     * Issue a sidebar-browser endpoint using the Host-resolved conversation and recorded mode.
     * @param agent - Agent resolved by the ordinary Session resource loader.
     * @returns A credential-free local endpoint, or undefined outside enabled Security mode.
     */
    browserEnvironment(agent: Agent): Promise<string | undefined>;
    /**
     * Bind public certificate material to the owner-requested conversation and current listener.
     * @param agent - Agent resolved by the ordinary Session resource loader.
     * @param server - Exact loopback endpoint already issued for this browser.
     * @returns Public PEM for an inspected listener, or null for an opaque listener.
     */
    browserTrust(agent: Agent, server: string): Promise<string | null>;
    /**
     * Retrieve one target through the proxy with full plaintext capture.
     * @param agent - the executing Agent.
     * @param url - the absolute HTTP(S) target.
     * @param signal - caller cancellation.
     * @returns the decoded response.
     */
    fetchTarget(agent: Agent | undefined, url: string, signal: AbortSignal): Promise<WebFetchResult>;
    /**
     * Read the whole settings and status surface.
     * @returns current state.
     */
    get(): Promise<SecurityProxyState>;
    /**
     * Change settings; transport changes are re-verified before this resolves.
     * @param patch - owner-edited fields.
     * @returns state after the write.
     */
    configure(patch: SecurityProxySettingsPatch): Promise<SecurityProxyState>;
    /**
     * Store or remove the upstream password.
     * @param password - the new secret, or null to remove the record.
     * @returns state after the write.
     */
    setPassword(password: string | null): Promise<SecurityProxyState>;
    /**
     * Run one real proxy-path check.
     * @returns the check outcome and the state after it.
     */
    test(): Promise<SecurityProxyTestResult>;
    /**
     * List retained flows for the application owner, newest first.
     * @param query - optional filters.
     * @returns matching rows and the capture counters.
     */
    list(query: SecurityProxyFlowQuery): Promise<SecurityProxyFlowsResult>;
    /**
     * Read one flow's detail for the application owner.
     * @param id - flow identity.
     * @returns the detail, or null when pruned or unknown.
     */
    detail(id: string): Promise<SecurityProxyFlowDetail | null>;
    /**
     * Export all matching stored records for the application owner.
     * @param query - Session, kind and text filters without pagination.
     * @returns Complete stored snapshot; oversized exports fail without returning records.
     */
    exportCapture(query: SecurityProxyExportQuery): Promise<SecurityProxyCaptureExport>;
    /**
     * Drop every retained flow.
     * @returns the capture counters after clearing.
     */
    clear(): Promise<SecurityProxyCaptureStats>;
    /**
     * Pause or resume capture; forwarding continues either way.
     * @param paused - whether new flows are refused.
     * @returns state after the change.
     */
    pause(paused: boolean): Promise<SecurityProxyState>;
    /**
     * Refuse an owner-only operation from a delegated Remote peer.
     * @param action - the attempted Remote method.
     */
    private assertOwner;
    private transportChanged;
}
//# sourceMappingURL=service.d.ts.map