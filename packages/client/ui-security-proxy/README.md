---
description: "Security-proxy settings area under Settings → Modes: enable, address, credentials, a real connection check, coverage, and the captured-traffic viewer."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-security-proxy

English | [中文](README.zh.md)

## Summary

This plugin renders the security mode's own network settings under the mode cards: the enable switch, protocol, address, port, the credential-backed password, a connection check whose result is the real proxy state, the honest coverage list, and a bounded viewer over the captured exchanges. When reminders are enabled, a persistent banner at the top of a Security conversation reports that its dedicated proxy is off. The banner switch disables reminders without changing the proxy.

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

Target settings stay unread until the panel is opened. Reconnecting refreshes only previously used settings and discards replies from the departed connection. The Target protection panel uses the [optional guarded Web profile](../../guard/target-protection/README.md#use-this-package). An application owner can configure mainland protection, add and edit production or test rules, manage aliases, and view the active revision and country data. Check for update refreshes the managed data independently of the rule draft. The panel reports the guarded web fetch and independent proxy mounts separately. If either route is withdrawn, the panel refreshes its status, retains the draft and disables saving. Edits remain drafts until Save rules. A conflict or connection change keeps the draft visible and prevents it from replacing the current Host rules.

Admission audit starts collapsed. Opening it loads the latest 100 records, and Host status changes refresh the open panel. Collapsing it suspends automatic reads. Filter by decision or search a target, fingerprint, rule ID or reason code. Each record expands to show the rule revision, check stage and complete identifiers. A failed refresh preserves the previously read page. Reconnecting clears the previous Host's records. An unavailable audit writer has a persistent notice.

The local execution rows display the Host's mounted file provider and its command/terminal policy. Admission checks, native gateway egress and native execution with networking disabled have distinct labels. Native commands still check platform support and target rules when launched. Older Hosts that omit execution status show only their reported HTTP routes.

SSH and database coverage is collapsed by default. SSH reports verified connections and connections with remote path rules; disconnect or revocation removes their count. SQLite, PostgreSQL and MySQL report configured binding counts separately from missing providers. Actual operations still check target, connection and access permissions. Older Hosts without these fields omit the group.

The shell coverage row includes one-shot commands and persistent shell terminals. They require applications to honor proxy environment variables; captured HTTP and opaque HTTPS tunnels retain their distinct labels.

Native desktop pages appear as Sidebar browser in the traffic list. Web iframes and attached external browsers do not use this proxy.

The MCP coverage row describes session-routed HTTP tools and resources and proxy variables for stdio servers. The application route handles startup discovery.

The external delegate row covers proxy-aware child processes launched by ACP, Codex, Claude Code, and DSH SDK providers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`controller.ts` owns the section's reads and writes. Settings reads, filtered lists and details have independent generations; only the current request publishes data or errors. Closing a detail or clearing capture invalidates its pending replies. A successful clear also preserves the cleared counters when an earlier settings reply arrives, and an accepted list refreshes the displayed capture counters. Settings writes use one serialized slot. `SecurityProxySection.tsx` renders from that store through the injected `hooks` compartment; local component state holds only the unsaved draft and the password field.

A failed list read retains available settings and records; a failed clear retains the displayed records and detail. Saving settings confirms that write independently of the following traffic refresh.

The viewer shows the captured request and response headers as the Host stored them, bounded bodies, the tunnel note for CONNECT-only rows, and an explicit truncation marker. Exchange details show the HTTP status and transport result separately. The truncation note names the affected body and capture or storage limit when the Host supplies that information. Tunnel rows never pretend to carry a body. Settings feedback uses the shared toast primitive. The reminder uses `conversation.mode.notice`, reads the current conversation mode and shares the settings controller; enabling the proxy or disabling reminders hides it.

Export JSON saves every retained record matching the active filter through the shared file-action service; the on-screen list limit does not apply. The provider enforces the [export byte budget](../../guard/security-proxy-local/README.md#use-this-package). Read or save failures keep the records visible and allow retry. Switching Hosts clears settings, records, filters, passwords and unsaved proxy drafts; departed replies cannot publish or start a download. Shutdown joins accepted file saves before releasing the file-action service.

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

- **Export scope** — JSON contains matching records still retained by the Host, including stored headers, bounded bodies and tunnel metadata. It does not recover expired records or import into another Host.
- **Memory-only records** — a restart clears the list with the Host's capture store.
- **Seat dependency** — the area registers into `settings.mode.materials`, the seat the mode settings page renders; it paints only while the selected mode is `security`.
- **Reminder display** — the persistent banner needs a connected GUI; it does not alter command-line execution or proxy routing.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The section deliberately keeps no polling loop: a settings page is read when opened and refreshed on demand, and each write returns the committed state, so the surface never shows a value the Host did not confirm.

</details>
