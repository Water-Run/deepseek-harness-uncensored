/**
 * Service Definition for the security-mode egress proxy seam (`ctx.securityProxy`).
 *
 * The seam answers three questions for a tool execution: whether this Agent's
 * session is a security-mode session the proxy serves, which environment a child
 * process needs to reach it, and how to retrieve one target through it while
 * recording the exchange. The providing plugin owns configuration, the upstream
 * connection, the loopback chain proxy, and the capture store; consumers never
 * build ordinary transports of their own. Native enforcement retains an egress
 * lease when it needs its own policy-checked gateway.
 *
 * The session's mode is read from its durable log, never from a tool argument: a
 * consumer passes the executing {@link Agent}, and a call without one is never
 * covered.
 * @module @deepseek-ai/dsh-security-proxy
 */
import { Service } from '@deepseek-ai/cordis';
/**
 * The egress seam. Implementations are Host-local: they own one configured
 * upstream, one loopback chain proxy, and one bounded capture store.
 */
export class SecurityProxyRuntime extends Service {
    /**
     * @param ctx - owning Cordis context; the service registers as `ctx.securityProxy`.
     */
    constructor(ctx) {
        super(ctx, 'securityProxy');
    }
}
export default SecurityProxyRuntime;
//# sourceMappingURL=index.js.map