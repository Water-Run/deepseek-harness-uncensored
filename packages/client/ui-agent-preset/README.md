---
description: "Choose the current conversation's Agent preset in Web and read what each mode does and declares. New conversations start in Standard."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-agent-preset

English | [中文](README.zh.md)

## Summary

Choose the current conversation's Agent preset in Web and read what each mode does and declares. New conversations start in Standard.

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

Settings highlights the current conversation's mode. The card body changes that selection. New conversations start in Standard; the default cannot be changed in Settings. Each card offers a read-only YAML composition viewer. A failed preset remains readable; Escape closes only the viewer and restores focus, while leaving Settings discards late reads. The Creator entry appears only when the deployment supplies `cordis` and a conversation flow.

This distribution supplies Default, Security, Reverse engineering and Writing, in that order. Deployments may supply additional presets. Coding Tools hides built-in PTC and Minimal entries when disabled; it does not hide named custom overrides. Creator starts a new task using the `cordis` preset when available.

Mode Settings also owns the temporary permission for changing existing conversations. Enabling it requires a ten-second reading interval and an explicit acknowledgement, validated by the Host; it remains off if cancelled. The permission is never saved and resets when the Host restarts. Existing conversations must be idle even after permission is granted. Other windows receive changes, and late reads cannot overwrite a newer revocation.

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

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
