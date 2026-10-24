---
description: "Security-mode egress proxy provider: one configured upstream, a per-conversation loopback chain proxy, and a bounded capture store with default redaction."
kind: "package-reference"
---

# @deepseek-ai/dsh-security-proxy-local

English | [中文](README.zh.md)

## Summary

This provider makes the security-mode proxy real. It owns the upstream address and its credential reference, a connection check that opens a real CONNECT through that upstream, one loopback listener per security conversation so child processes reach the proxy without touching the Host environment, and a bounded store of captured exchanges. Only the `security` preset is covered; the model API, sign-in, balance, update checks, and every other mode keep their existing route because this plugin never installs a process-wide dispatcher.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The base bundle mounts it; a deployment states only where its settings live:

```yaml
- id: security-proxy
  name: '@deepseek-ai/dsh-security-proxy-local'
  config:
    path: !!js dshHomePath('storages', 'security-proxy.json')
```

The feature is off by default. Settings, status, the connection check, the traffic list and detail, pause, and clear are the Remote namespace `securityProxy`; the [settings surface](../../client/ui-security-proxy/README.md) drives them.

The upstream password is stored through `ctx.credentials` under `DSH_SECURITY_PROXY_PASSWORD` and resolved per operation. It is never written to the settings file, a flow, or an error message.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| Piece | Owner | Boundary |
|---|---|---|
| Settings document | `settings.ts` | Atomic temp-then-rename write, validated on load and on every patch; a malformed document keeps defaults and reports why. |
| Capture store | `capture.ts` | Ring buffer with flow-count, body-byte, and retention caps; headers and JSON/form secret fields are redacted once, at append. |
| Upstream transport | `upstream.ts` | `ProxyAgent` over the configured `http:`/`https:` URL; CONNECT is a verified `node:http(s)` request. TLS verification is never relaxed. |
| Per-session chain proxy | `chain.ts` | Loopback-only listener: plain HTTP is forwarded and captured in full; CONNECT is tunnelled and recorded as metadata only. |
| Engine | `engine.ts` | Owns the dispatcher, listeners, status machine, controlled fetch, and the once-per-conversation reminder. |
| Remote surface | `service.ts` | `get`, `configure`, `setPassword`, `test`, `list`, `detail`, `clear`, `pause`; mutations require the application owner. |

The controlled fetch follows same-origin redirects, classifies content with the web provider's own helpers, caps the decoded body, and records the exchange it actually sent and received. That is why an HTTPS target is fully visible for this one tool while a child process's HTTPS tunnel is not: nothing intercepts TLS, and the plaintext exists only where the application itself wrote the request.

Status is `off`, `connecting`, `ready`, or `failed` with a machine reason (`invalid-config`, `unreachable`, `timeout`, `auth`, `tls`, `unknown`). A failed check never reports ready, and the underlying detail line carries no credential. Disabling the feature closes the dispatcher and every listener; a settings change that touches the address, protocol, or credentials does the same before re-verifying.

The reminder fires at most once per conversation, when a covered tool call finds the proxy off and the owner enabled the reminder; the set clears when the conversation is disposed.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Service Definition](../security-proxy/README.md) — the seam every consumer codes against.
- [Settings surface](../../client/ui-security-proxy/README.md) — the Modes-section area, the connection check, and the traffic viewer.
- [Outbound proxy library](../../util/http-proxy/README.md) — the launch-environment policy this plugin deliberately does not use.

-----

<a id="model-experience"></a>
## Model Experience

None by itself, with one exception worth stating: in a security conversation, `web_fetch` retrieves through this proxy, and a proxy failure reaches the tool result as a typed `WebError` code. The tool's schema, description, and rendering do not change.

#### KV Cache effect

No effect: routing changes no request content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Coverage** — `web_fetch` and one-shot shell tools are routed. The browser tool, MCP servers, persistent terminals, delegated agents, and anything that ignores proxy environment variables are not; the settings surface says so instead of implying otherwise.
- **No interception** — HTTPS bodies carried by child processes stay sealed. Only the plaintext this application writes is captured.
- **Loopback trust** — each session listener binds `127.0.0.1` on an operating-system-assigned port with no local authentication; another local process could use it while it is open. It closes with the conversation, with a settings change, and with Host shutdown.
- **Record lifetime** — flows live in memory only and are lost on restart. Retention is capped by count, body bytes, and age.
- **Target protection** — no enforced protection provider exists in this build, so the proxy neither calls one nor claims one is active.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The chain listener exists because a child process needs an address, not a policy object. One listener per conversation is also what makes attribution honest: a flow's conversation is the listener that received it, not a guess made after the fact.

</details>
