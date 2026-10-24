---
description: "Service Definition for the security-mode egress proxy seam: how tools ask whether a conversation's target traffic is routed through the independent proxy."
kind: "package-reference"
---

# @deepseek-ai/dsh-security-proxy

English | [中文](README.zh.md)

## Summary

Security conversations can send their target traffic through one upstream proxy the user configures. This package owns only the question every consumer asks: is this execution covered, which environment does a child process need, and how is one target retrieved through the proxy. It installs no transport, reads no setting, and holds no traffic: [`@deepseek-ai/dsh-security-proxy-local`](../security-proxy-local/README.md) provides all three.

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

Consumers reach the seam optionally, so a composition without the provider keeps its existing behavior:

```ts
const proxy = ctx.get('securityProxy')
const route = proxy?.route(exec.agent, 'web_fetch')
const result = route === undefined
  ? await ctx.web.fetch({ url }, exec.signal)
  : await proxy.fetchTarget(exec.agent, url, exec.signal)
```

`route` takes the executing `Agent`, never a mode argument: the provider reads the session's durable preset record. A call without an Agent, or from a session whose recorded preset is not `security`, is never covered.

The provider registers as `ctx.securityProxy`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The entry point is an abstract `Service` with three operations — `route`, `environment`, and `fetchTarget` — plus the payload types the Remote surface reads. `route` returns the conversation identity and tool name a flow is attributed to; `environment` returns the overlay for exactly one spawn; `fetchTarget` returns the ordinary `WebFetchResult` the web seam already defines, so a covered fetch and an uncovered one hand the model the same value.

`fetchTarget` failures use the seam's open `WebError` codes (`SECURITY_PROXY_NOT_COVERED`, `SECURITY_PROXY_UNREACHABLE`, `SECURITY_PROXY_AUTH`, plus the web provider's own timeout and abort codes), so a tool result explains whether the proxy or the target failed.

The package also declares the `security-proxy/warning` Host event, the Remote failure code `security-proxy/owner-required`, and the `agent-preset/selected` session event this seam reads. The preset package owns that event; this declaration points the compiler at the vocabulary because the preset package publishes no session subpath.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Provider](../security-proxy-local/README.md) — the configured upstream, loopback chain proxy, capture store, and settings surface.
- [Settings surface](../../client/ui-security-proxy/README.md) — the Modes-section area and traffic viewer.
- [Web seam](../../web/web/README.md) — `ctx.web`, whose `WebFetchResult` this seam returns.

-----

<a id="model-experience"></a>
## Model Experience

None. The seam adds no tool, schema, or prompt text. A covered `web_fetch` returns the same result shape as an uncovered one; only its transport and capture differ.

#### KV Cache effect

No effect: the seam changes no request content and no tool catalog.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Mode authority** — coverage comes from the session's committed preset and the recorded selection events; a tool argument cannot claim a mode.
- **No interception** — a covered HTTPS fetch is recorded at the controlled Client layer. Tunnel-only traffic stays opaque by design.
- **No target-protection coupling** — the seam exposes no protection hook because this build mounts no enforced target-protection provider.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The three operations exist because three consumers need different things: tools need a decision, child processes need an environment, and the web fetch tool needs a transport. Keeping them on one seam prevents each consumer from reconstructing coverage from settings.

</details>
