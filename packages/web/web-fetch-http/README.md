---
description: "The anonymous public HTTP(S) fetch backend for ctx.web: how deployments mount bounded, safe URL retrieval with same-origin redirects and text-only decoding."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-fetch-http

English | [中文](README.zh.md)

## Summary

Fetch public HTTP(S) pages with bounded, decoded content and anonymous origin requests. Direct connections validate and pin public addresses; configured proxies normally resolve the origin remotely. Deployments enforcing target rules can opt into literal-IP proxy tunnels. Redirects stay within one origin, and time, byte and character limits bound retrieval. Non-2xx responses remain results; invalid destinations and unsupported content fail. The `web_fetch` tool in `dsh-tool-web` renders these results.

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

Mount the provider in a composition that already loads the web service; it registers as the `http` fetch provider, so `ctx.web.fetch()` resolves it automatically when it is the only usable fetch backend — or pin it with `fetchProvider: http`.

### When to choose it

Choose this backend for bounded public pages, anonymous origin requests and same-origin redirects. Direct connections pin public addresses. Proxy-side DNS is the ordinary proxy behavior; deployments needing verified proxy targets use the literal CONNECT mode described below.

### Minimal configuration

Load the web service and the provider; configurable limits have safe defaults and validate at plugin construction, so an invalid value fails loudly instead of building a provider with nonsensical caps. The URL security limit is fixed at 2,048 characters.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-fetch-http'
```

| Field | Default | Meaning |
|---|---|---|
| `maxResponseBytes` | `5,000,000` | Maximum response body size in bytes |
| `maxBodyChars` | `100,000` | Maximum decoded body length in characters |
| `timeoutMs` | `30,000` | Fetch timeout — a resource backstop, not the model-facing tool budget |
| `maxRedirects` | `5` | Maximum same-origin redirect hops (`0` follows none) |
| `userAgent` | `deepseek-harness/…` | `User-Agent` header sent on every request |

The [configuration declaration](src/index.ts) lists every accepted field and its JSDoc.

### What a fetch returns

A successful call yields a `WebFetchResult`: the final URL after allowed redirects, the HTTP status code, a decoded body classified as `html` or `text`, and a `truncated` flag. A non-2xx response is a result, not an error — the status code is part of the fetched resource state; `WebError` is reserved for failures to safely retrieve or represent the resource.

```text
const page = await ctx.web.fetch({ url: 'https://example.com' })
// page.body.kind === 'html' | 'text'; page.statusCode === 200 | 404 | ...
```

### Transport behavior

The provider keeps requests anonymous and bounded: it accepts only `http:` and `https:` URLs without embedded credentials and rejects URLs over 2,048 characters. It resolves each hostname once, rejects the complete result if any IPv4 or IPv6 address is not public unicast, and pins the connection to that validated set. IPv6 checks discover the active DNS64 prefix and reject translations to non-public IPv4. Each same-origin redirect repeats resolution and pinning; cross-origin redirects fail and require a fresh call. The provider also enforces byte, character, hop, and time caps, rejects unsupported content types, and sends an explicit product `User-Agent`.

### Failures and recovery

Failures throw `WebError` with a machine-routable code: `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_REDIRECT_BLOCKED`, `WEB_UNSUPPORTED_CONTENT_TYPE`, `WEB_ABORTED`, or `WEB_PROVIDER_ERROR`. Direct callers can route on the code; the model-facing `web_fetch` tool surfaces the failure text to the model under its own error wrapper.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the provider; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The package is built on one separation and one layered timeout:

- **Safe retrieval vs. presentation.** This provider owns URL validation, public-address enforcement, connection pinning, HTTP transport, redirect policy, caps, charset decoding, and binary rejection; `dsh-tool-web` owns HTML→markdown and truncation formatting. A non-2xx response is data, not failure.
- **Two timeout layers.** The provider's `timeoutMs` is a resource backstop for direct `ctx.web.fetch()` callers; the model-facing tool-call budget belongs to `dsh-tool-call-timeout-policy`, which arms `exec.signal`. When the outer deadline fires first the provider reports `WEB_ABORTED` and the policy replaces it with `TOOL_TIMEOUT`; `WEB_FETCH_TIMEOUT` therefore identifies a direct service caller whose provider budget elapsed.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, limit validation, provider registration |
| [`src/provider.ts`](src/provider.ts) | The `HttpFetchProvider`: pinned transport, redirect following, capped reads, charset decoding |
| [`src/network.ts`](src/network.ts) | Public-address resolution, DNS64 discovery, and connection pinning |
| [`src/policy.ts`](src/policy.ts) | URL validation, same-origin checks, content-type classification, charset parsing |

### Read path

A fetch validates the URL, resolves the hostname once, rejects the complete answer set when any address is not public, and pins the connection to the accepted addresses. It repeats that check for each same-origin redirect; a cross-origin redirect or non-public target fails before response bytes are accepted. The final response is classified by `Content-Type`, decoded from its declared charset, and read under the byte cap; the decoded text is then truncated to the character cap.

The mounted provider dispatches `web-fetch/authorize` before each hop's resolution and immediately before its connection. A listener may return a denial, which produces `WEB_TARGET_PROTECTED`; it cannot grant permission over another listener's denial. The second checkpoint reports either the exact pinned address set or `null` for proxy-side resolution, always alongside the original destination authority. Query strings and credentials are excluded. Cancellation after an asynchronous check prevents transport admission. This execution hook does not itself classify protected targets; deployments must provide that policy. Standalone `HttpFetchProvider` callers can supply the equivalent authorizer as the third constructor argument.

The fourth constructor argument, `literal-connect`, resolves and authorizes proxy destinations locally. A private Undici proxy dispatcher CONNECTs to the first validated IP, preserving the original Host, TLS name and certificate verification; it never retries by connecting directly. Each redirect repeats validation. The configured resolver sees DNS queries; the HTTP proxy receives a literal destination instead of resolving its name. This mode requires a proxy that supports IP CONNECT. Ordinary plugin configuration keeps remote proxy DNS.

The exported `requestPinnedViaProxy` helper also accepts a structured HTTP method and optional body bytes. It fixes Host to the original URL and removes proxy authorization from origin headers. Callers own admission and response cleanup; the anonymous fetch provider still uses GET.

`resolveHttpFetchLimits(config)` supplies the same defaults and validation to alternate consumers, including the mandatory target-protection wrapper. Creating a wrapper does not bypass the shared transport limits.

`resolvePublicAddresses` is exported for consumers supplying verified DNS evidence. Its optional `translatedIpv4` metadata retains a discovered NAT64 destination for policy checks; transport pinning still uses the original IPv6 address.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the shared vocabulary to the service, the model-facing tools, and the design rationale.

- [Web types](../web/src/types.ts) — fetch request/result fields and error codes.
- [Web package map](../README.md) — the six-package family and each role.
- [dsh-web](../web/README.md) — the web service this provider registers into.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_fetch` tool that renders this provider's bodies.
- [Configuration source](src/index.ts) — accepted fields, defaults and validation.
- [Web capability seam decision](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) — why search and fetch share one provider-selection service.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which renders this provider's `maxBodyChars`-bounded decoded text or markdown-shaped HTML under its fetch-result wrapper while redirects, headers, and transport limits remain hidden.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the provider is unsafe or a poor fit. They are current package constraints.

- **Only textual content decodes** — html/xhtml and `text/*` plus JSON/XML families; a missing `Content-Type` or any binary type throws `WEB_UNSUPPORTED_CONTENT_TYPE`, and text-extractable PDF decoding is named deferred work.
- **Charset comes only from the `Content-Type` header** (UTF-8 default) — an HTML `<meta charset>` declaration is ignored, and a declared-but-unrecognized charset label throws rather than falling back.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
