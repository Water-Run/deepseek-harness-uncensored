---
description: "Choose the current conversation's Agent preset in Web and read what each mode does and declares. New conversations start in Default."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-agent-preset

English | [中文](README.zh.md)

## Summary

Choose the current conversation's Agent preset in Web and read what each mode does and declares. New conversations start in Default.

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

The first-entry declaration appears as a muted input hint. Matching prefixes are blue and mismatches are red; confirmation compares NFKC-normalized text on both Client and Host, so full-width and half-width forms are equivalent. Different words still fail, and composition does not submit the declaration.

Delayed animation callbacks cannot replace a newer conversation's accent or restore it after this plugin unloads.

Settings highlights the current conversation's mode. The card body changes that selection. New conversations start in Default; the default cannot be changed in Settings. Each card offers a read-only YAML composition viewer. A failed preset remains readable; Escape closes only the viewer and restores focus, while leaving Settings discards late reads. The Creator entry appears only when the deployment supplies `cordis` and a conversation flow.

Mode configuration is its own block, with one tab per mode that publishes a panel. The tab list comes from the `settings.mode.materials` contributions: a contribution registers under the preset id it configures, so another mode panel needs no change here. The configured mode is independent of the conversation's mode — a card's **Configure** action opens that mode's tab without selecting it, and changing the conversation's mode leaves the open tab alone. One configurable mode names itself instead of showing a tab strip; with none, the block is absent.

**Confirm sensitive actions** is on by default and governs the dialogs that ask before a sensitive action runs: the temporary switching permission, the first-entry Security acknowledgement, and any later action that asks first. Turning it off runs a ten-second countdown and is persisted by the Host; cancelling leaves it on. Turning it back on commits at once. Every window shares the preference, and a change from another window closes a countdown it made obsolete.

This distribution supplies Default, Security, Reverse engineering and Writing, in that order. Deployments may supply additional presets. Coding Tools hides built-in PTC and Minimal entries when disabled; it does not hide named custom overrides. Creator starts a new task using the `cordis` preset when available.

The main view's mode colors the whole client: the plugin writes `body[data-dsh-mode]` for the four shipped modes, including a mode picked before a new conversation exists, and ui-theme maps it onto the accent (blue for Default, red for Security, green for Reverse, yellow for Writing). Hidden legacy and custom presets keep the platform accent and a neutral header card. The conversation header shows the current mode as a filled card in that mode's dark color with the shared white ink and no select chevron; where existing-conversation switching is allowed, the card itself opens the roster instead of presenting a dropdown, and the inert card keeps its mode color. Changing the mode of the same conversation spreads the new accent as a circle from the control that chose it, or from the brand's mode marker; moving to another conversation fades the accent instead. The selected mode card floods with its color and its icon pops, and the header card's icon pops when the mode changes. Reduced motion applies every change at once.

Mode Settings also owns the temporary permission for changing existing conversations. Enabling it requires a ten-second reading interval and an explicit acknowledgement, validated by the Host; it remains off if cancelled. The permission is never saved and resets when the Host restarts. Existing conversations must be idle even after permission is granted. Other windows receive changes, and late reads cannot overwrite a newer revocation. While the permission is off, the conversation header keeps the mode control in place, grayed and disabled, with a hint that points back to Settings instead of hiding it.

The first time a new main conversation selects Security after each Host start, a separate confirmation opens. It shows the protection provider's live status, waits ten seconds, and asks for the Host-issued declaration when protection is off or cannot be confirmed. The choice is neither staged nor sent until the Host accepts it; cancelling keeps the current mode and draft. A Host restart asks again, a page refresh does not, and later new conversations share the same launch acknowledgement. Established conversations keep using the temporary switching permission above. The shipped Web composition has no protection backend, so the dialog reports protection as unavailable rather than claiming it is enabled.

Turning Coding Tools off clears unapplied choices. The user can select an available preset again afterward. Existing sessions keep their selected mode, including when it is absent from the menu. Turning Coding Tools back on does not restore a cleared choice. Legacy saved defaults do not affect new conversations.

Known shipped presets offer mode details and usage examples in a read-only dialog. Minimal's guide explains image reading, automatic history compaction, and the idle-session `/compact` command. Its tabs preserve each page's scroll position; closing returns focus to the opening action. Help does not change the new-task default. The default badge replaces the card's group badge, and the preset id appears beside the title. Guide copy and examples belong to this package.

**Let the agent create a plugin** in the Plugins page's **Add plugin** arrow menu enters the same Creator flow as Settings. It submits no message and preserves unsent drafts. While the roster loads or Creator is unavailable, the menu item is disabled with an explanation. Both entries show a Toast with the reason if the Host refuses the preset switch.

Entering Creator selects `cordis` for the receiving blank Session without changing the new-task default or Coding Tools setting. If no workspace or blank Session is bound yet, the choice waits for that binding. After the choice is applied, the Creator Session keeps its preset; a later newly created Session uses the configured default, such as Standard.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`agentPresets/list` supplies the roster and marks the deployment default, and `agentPresets/read` supplies one declaration's YAML for the viewer. The picker, blank-session synchronization and read-only session label use recorded preset identities. Connection resets and settings updates refresh the roster.

`CreatePluginMenuItem` contributes to `plugins.add.actions` using the shared roster store. Its selection calls the owner's `onDismiss()` before the same `startCreatorDraft` callback exposed to Settings as `creatorDraft`. That callback stages `cordis` through `AgentPresetSeatController` and opens the task through `uiWorkspace.startSession` with explicit draft preservation and `agentPreset: 'cordis'`, so the Host composes the reused blank or new Session under Creator; without a target Workspace, the staged choice applies when a Session binding becomes available. The choice is consumed once applied. Both Coding Tools states use the same picker and selection store, and `AgentPresetSeat` renders refusals through the shared `Toast` component.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Scope](../../core/scope/README.md) — Registration isolation.
- [Agent](../../core/agent/README.md) — Session runtime.
- [Cordis](../../../vendor/cordis/README.md) — Plugin configuration and lifecycle.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the selected preset, whose plugins own model-visible capabilities.

#### KV Cache effect

Selection changes affect only later tasks; existing plugins and prompts remain unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Web creates and edits no preset: the configuration viewer is read-only, and a bundle installed through Creator mode declares a new preset or overrides a shipped one by row id, replacing its complete child list.
- The Security entry confirmation reports the composed protection provider's live state. The Web product ships no provider, so it takes the unavailable branch and asks for the declaration; the enabled branch is covered with a test provider, not a production backend.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
