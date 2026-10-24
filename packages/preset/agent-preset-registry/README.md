---
description: "Choose an Agent’s tools, prompt sections and skills through declarative presets. One process can run several compositions. Failed definitions remain visible, while existing Agents retain the composition they already use."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-preset-registry

English | [中文](README.zh.md)

## Summary

Choose an Agent’s tools, prompt sections and skills through declarative presets. One process can run several compositions. Failed definitions remain visible, while existing Agents retain the composition they already use.

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

Security-entry declarations compare NFKC-normalized text after trimming outer whitespace. Character width does not change acceptance; the issued statement, reading interval, conversation identity and protection revision still have to match.

The public selection roster omits definitions marked `hidden`. Historical resolution and mounting still use their own compositions, so removing an old choice from the picker does not replace its tool set with another mode.

### Minimal configuration

```yaml
- id: agent-preset-registry
  name: '@deepseek-ai/dsh-agent-preset-registry'
  config:
    default: standard
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: standard
    plugins: []
```

| Field | Default | Meaning |
|---|---|---|
| `default` | required | Preset ID used when none is requested |
| `securityEntryPreset` | `security` | Preset that carries the first-entry acknowledgement |
| `requireSecurityEntryAcknowledgement` | `false` | Whether a new main conversation must acknowledge that preset once per Host lifetime |

The Web definitions come from the `dsh-web-app` bundle. Definitions are ordinary plugin rows; the registry neither scans directories nor accepts preset paths. New sessions use the deployment `default`, which is `standard` in the shipped Web profile. The legacy `selectedDefault` field is accepted but ignored; explicit per-session selections remain supported. A profile patch may still carry the retired `modeSelectionEnabled` field; the registry declares no such field and neither reads nor rewrites it.

Established conversations can change mode only while idle and after owner acknowledgement. `beginModeSwitch` issues a one-time challenge, `confirmModeSwitch` enforces ten seconds of monotonic elapsed time, and `disableModeSwitch` revokes permission and pending challenges. Challenges expire after five minutes. Permission starts disabled for each registry lifetime and is never persisted. The legacy `allowExistingSessionSwitch` configuration field is accepted but ignored; editing it cannot authorize a switch. New conversations remain selectable without this acknowledgement.

### Security first-entry acknowledgement

The Web profile sets `requireSecurityEntryAcknowledgement: true`. Before a new main conversation first enters `securityEntryPreset`, `select` refuses the selection with `security-entry/required` until the Host recorded this launch's acknowledgement. `beginSecurityEntry` issues a one-time challenge bound to the application owner, the registry lifetime, one blank top-level conversation, and the protection provider's revision. `confirmSecurityEntry` enforces ten seconds of monotonic elapsed time, consumes the challenge, and rejects a changed protection revision with `security-entry/changed`. `cancelSecurityEntry` drops the challenge without granting the acknowledgement. Only the application owner may begin, confirm, or cancel.

The acknowledgement is memory-only and shared by every window of the same Host. A Host restart asks again; a page refresh only reads the existing state. Established conversations keep the separate temporary switching permission and never use this acknowledgement. `assertNewConversationPreset` applies the same requirement to a caller that explicitly creates a Security conversation.

`securityEntryState()` reports the deployment policy beside the live protection state. A deployment may provide `securityProtection` with `read(): SecurityProtectionStatus`; the provider must emit `security-protection/changed` after a status or revision change so an open challenge is invalidated and the client restarts its reading interval. Without a provider, the state is `unavailable`, the dialog treats protection as not enabled, and the challenge requires the localized declaration. The declaration text is issued by the Host and validated verbatim; the client does not keep its own copy.

The registry writes no declarations. The `read` Remote renders one declaration’s child list back as entry-list YAML (`!!js` conditions included) so a client can show what a preset composes; nothing accepts YAML back. A new preset or an override of a shipped one is a bundle patch: an `insert` of a `@deepseek-ai/dsh-agent-preset` row, or a patch keyed by that row’s id, installed into the profile with `plugin_manager`; Creator mode authors such bundles in conversation.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Each declaration eagerly creates a registry-owned scope and an in-memory Loader tree. Updating or removing a declaration retires its previous revision. Agents, children and temporary historical reads retain references; releasing the final reference disposes the retired tree. Plugin registrations inherit the preset scope, and the Agent scope’s parent link controls visibility. The Host continues to share the Agent loop.

A preset service provider and its consumers must share one `cordis:group` isolation realm. Entry-local isolation does not propagate through the Agent registration scope: ordinary Context lookup outside the group, including `agent.ctx`, still selects the Host realm. `agentPresets.serviceFor()` explicitly inspects the retained composition; it does not change ordinary service lookup.

Activation auditing checks imports, missing services and globally leaked services. Import failures, activation failures and leaks reject the mount. A row waiting for a Host service stays mounted, and every read and binding re-audits it after the Host Loader tree settles, so startup order does not decide the outcome. Failure prevents new bindings to that definition. Session logs retain the preset ID and blank-session selections; recovery after restart uses the current definition of that ID and rejects a missing definition. `select` leaves a blank Session that records the requested preset and already runs its current revision unchanged, without another selection record or `tools/change`.

`inspectCompositions()` reads all revisions retained by this registry; passing an Agent context selects its exact revision, or returns an empty list when it has no binding here. Each `AgentPresetInspection` contains a preset ID, detached active-module references with their resolution bases, and leaked-service names. Inspectors query the runtime service rather than a module-local mount table; the results contain no Loader trees or fibers. [composition-inventory.ts](src/composition-inventory.ts) defines these records.

| File | Responsibility |
|---|---|
| [index.ts](src/index.ts) | Registration, revisions, Agent bindings, and Remote policy |
| [security-entry.ts](src/security-entry.ts) | First-entry challenge, declaration, and monotonic timing |
| [mount.ts](src/mount.ts) | Scoped plugin trees and activation auditing |

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Scope](../../core/scope/README.md) — Registration isolation.
- [Agent](../../core/agent/README.md) — Session runtime.
- [Cordis](../../../vendor/cordis/README.md) — Plugin configuration and lifecycle.

<a id="model-experience"></a>
## Model Experience

### Preset selection

#### What the model sees

Nothing directly: the selected preset’s `plugins` own the model-visible tools and prompt sections.

#### Token effect

None from this package; each mounted `plugins` row declares its own tools and sections.

#### KV Cache effect

Existing Agents retain their plugins and prompts. New Agents build their prefixes from the current definition.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Presets are not security sandboxes: YAML and plugins can execute Host code. A user override replaces the complete child list and does not automatically merge future changes to the builtin list. Old revision implementations are not retained across process restarts.
- The Web product composes no `securityProtection` provider. Its first-entry dialog therefore reports protection as unavailable and requires the declaration; the enabled branch is exercised only by test providers until the execution protection in the deferred target-protection work is restored.
- The acknowledgement records the operator's declaration for this Host lifetime. It does not enforce target protection, and it does not prove authorization for any third-party target.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
