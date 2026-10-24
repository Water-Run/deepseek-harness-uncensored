---
description: "Security-proxy settings area under Settings → Modes: enable, address, credentials, a real connection check, coverage, and the captured-traffic viewer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-security-proxy

English | [中文](README.zh.md)

## Summary

This plugin renders the security mode's own network settings under the mode cards: the enable switch, protocol, address, port, the credential-backed password, a connection check whose result is the real proxy state, the honest coverage list, and a bounded viewer over the captured exchanges. It also paints the once-per-conversation reminder that the Host forwards when security mode runs with the proxy off.

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

The Web app loads it as a browser row; nothing else to install. The area registers into `settings.mode.materials`, the mode-materials seat under the preset cards, and paints only while the selected mode is `security`. Its Remote namespace is `securityProxy` from [`@deepseek-ai/dsh-security-proxy-local`](../../guard/security-proxy-local/README.md).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`controller.ts` owns the section's reads and writes: one serialized write slot, a generation counter so a slow read never publishes over a committed write, and a filter translated into the Remote query. `SecurityProxySection.tsx` renders from that store through the injected `hooks` compartment; local component state holds only the unsaved draft and the password field.

The viewer shows the captured request and response headers (already redacted on the Host), bounded bodies, the tunnel note for CONNECT-only rows, and an explicit truncation marker. Tunnel rows never pretend to carry a body. Feedback uses the shared toast primitive; the reminder uses the shell overlay seat and is dismissed by the Host's message identity.

All copy lives in the typed locale dictionary (`en`/`zh`); no UI string is hardcoded in the components.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Provider](../../guard/security-proxy-local/README.md) — the settings, status, and capture this surface drives.
- [Service Definition](../../guard/security-proxy/README.md) — the seam behind the routing decision.
- [Slots package](../ui-slots/README.md) — how the mode-materials seat composes.

-----

<a id="model-experience"></a>
## Model Experience

None. This surface reads and writes configuration; it sends no model-visible content.

#### KV Cache effect

No effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No export** — the viewer offers filtering, detail, pause, and clear; exporting a flow list is not implemented, so no export can bypass redaction.
- **Memory-only records** — a restart clears the list with the Host's capture store.
- **Seat dependency** — the area registers into `settings.mode.materials`, the seat the mode settings page renders; it paints only while the selected mode is `security`.
- **Reminder delivery** — the reminder needs a connected Web client; a headless run emits the Host event with no surface to paint it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The section deliberately keeps no polling loop: a settings page is read when opened and refreshed on demand, and each write returns the committed state, so the surface never shows a value the Host did not confirm.

</details>
