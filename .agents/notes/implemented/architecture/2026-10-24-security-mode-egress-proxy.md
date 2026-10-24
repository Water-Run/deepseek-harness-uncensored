# Agent Note: Security-mode egress proxy as a session-scoped seam

Status: implemented

English | [中文](2026-10-24-security-mode-egress-proxy.zh.md)

## Problem

The security preset needed an independent proxy for target traffic: configuration, a real connection check, and a viewer over captured requests and responses. Three constraints made a naive "set `HTTP_PROXY`" approach wrong.

- The process already publishes one outbound proxy policy resolved from the launch environment and installs it as undici's global dispatcher, which is what `fetch` resolves. A second proxy installed there would move the model API, sign-in, balance, and update checks off their route.
- Coverage has to follow the conversation's mode. A tool argument, or a client-supplied mode string, cannot decide it; only the session's durable record can.
- HTTPS through a proxy is opaque unless something intercepts TLS. The requirement forbids relaxing verification, so a captured body must come from the layer that actually wrote the request.

## Decision

Split the capability seam from its provider and make both explicit.

- `@deepseek-ai/dsh-security-proxy` is the Service Definition (`ctx.securityProxy`): `route(subject, tool)`, `environment(subject, tool)`, and `fetchTarget(subject, url, signal)`. The subject is structurally any object carrying a session identity, so an `Agent` satisfies it and a test supplies its own.
- `@deepseek-ai/dsh-security-proxy-local` is the provider. It owns one settings document, one bounded capture store, one upstream `ProxyAgent`, one loopback chain proxy per conversation, and the status machine. It never calls `installProxyFromEnvironment` and never touches the global dispatcher.
- Coverage reads the last committed `agent-preset/selected` event or the session header through a cache the plugin updates from `session/event`. The preset package owns that event but publishes no session subpath, so the seam restates the declaration; a payload change would be a compile error, not a silent mismatch.
- The controlled `web_fetch` records at the client layer: it builds the request, reads the response, and stores both after redaction. Child processes get a per-conversation loopback listener through that one spawn's environment; plain HTTP through it is captured in full, and CONNECT is recorded as metadata only with `tunnel-metadata-only`.
- Redaction happens once, at append: secret-bearing headers and common JSON/form secret fields are replaced before anything can read the row. Caps apply to flow count, body bytes, and retention; bodies live in memory only, so a restart cannot resurrect stale traffic.
- The proxy-off reminder is a forwarded Host event (`security-proxy/warning`), deduplicated in the engine per conversation and cleared on disposal. It never changes proxy state.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Install a second global dispatcher per mode | Process-wide by construction; model and control-plane traffic would follow it. |
| Route child processes through the upstream directly | No attribution and no capture; each conversation needs its own listener to make the conversation column honest. |
| Intercept TLS to show HTTPS bodies | Forbidden by the requirement, and it would put every target's credentials in the app's trust path. |
| Pass a `mode` argument from tools | A model-facing argument cannot be the authority for a network policy. |

## Consequences

- Only the security preset is affected; every other mode keeps the launch-environment policy and the direct provider.
- `web_fetch` in a security session returns the same `WebFetchResult` shape; failures surface as typed `WebError` codes, so the transcript explains a proxy failure without a new tool.
- Browser tooling, MCP servers, persistent terminals, delegated agents, and programs that ignore proxy environment variables stay uncovered; the settings surface states the real coverage instead of implying it.
- The loopback listener has no local authentication. It is bound to `127.0.0.1`, exists only while its conversation does, and closes on a settings change and on Host shutdown.
- The build mounts no enforced target protection, so `10.05` remains open: the proxy neither calls a protection hook nor claims one is active.

## Related records

The existing [outbound proxy policy](2026-08-27-outbound-proxy-policy.md) still applies: it decides the process route. This record adds an exit that only security conversations use and that never enters the process-wide dispatcher.
