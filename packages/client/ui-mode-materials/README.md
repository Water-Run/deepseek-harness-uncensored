---
description: "Settings panels for the specialized modes: security and reverse-engineering case ledgers, the writing registry and its selection, and read-only sample inventory, all under the mode cards."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-mode-materials

English | [中文](README.zh.md)

## Summary

Use this package to manage the files the specialized modes keep, from Settings → Modes. It registers one panel per mode into `settings.mode.materials`, the slot the mode section renders below its cards, and reads and writes everything through the Host's `modeDossiers` Remote namespace. Only the panel that owns the current mode renders; the others stay mounted and render nothing, so switching modes never closes an open dialog or discards typed text.

Each panel can open the shared memory manager with its mode filter selected. New records inherit that mode; the workspace and sharing scope remain visible in the editor.

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

Mount the package in the browser roster beside `@deepseek-ai/dsh-api-mode-dossiers`. It requires the mode section's slot declaration (owned by `@deepseek-ai/dsh-client-ui-agent-preset`), the Workspace UI service for the workspace picker, and the Remote namespace.

| Panel | Mode | Content |
|---|---|---|
| `SecurityMaterials` | `security` | Case list, a new-case dialog, the open ledger with objective, targets, evidence, findings and notes, and the rendered report |
| `ReverseMaterials` | `reverse` | The same case workbench for `.reverse/`, the tool status this Host actually reaches, and a read-only sample inventory form |
| `WritingMaterials` | `writing` | `story/style` and `story/bible` materials, the selection writing requests receive, adoption of unregistered documents, and a content editor |

The scope bar names the workspace the panels manage, its Host path, and the entry that opens the directory picker. With no workspace, or with a workspace whose directory disappeared, the panel states the condition instead of writing anywhere.

### Editing and conflicts

Every editor dialog captures the workspace it was opened from, so a later workspace change cannot route its save into another workspace. A save carries the version the document was opened at; when the file changed meanwhile, the dialog stays open with its text and reports the conflict, and overwriting on purpose takes a second, explicit action in the writing editor.

### Deleting

Deleting a case record removes that record from `case.json` and says so; samples and evidence files are untouched. Deleting a writing record removes the registry entry and the selection, and the dialog states that the document under `story/` stays in the workspace.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/client/index.ts` owns the Remote calls, the inventory store, and the three registrations; `src/client/contract.ts` is the injected face the panels receive; `ModeMaterials.tsx` is the per-mode dispatcher; `CaseWorkbench.tsx`, `ReversePanel.tsx`, and `WritingPanel.tsx` are the panels; `ui.tsx` and `scope.tsx` are the shared modal and workspace pieces. Components never see `ctx`: they receive plain data, callbacks, and the bound inventory hook.

## Further Exploration

- [Mode dossier storage](../../api/mode-dossiers/README.md) — the Host service, file formats, and failure codes this surface renders.
- [Mode settings section](../ui-agent-preset/README.md) — the owner of the slot this package contributes to.

<a id="model-experience"></a>
## Model Experience

This package adds nothing to a model request. It edits the files that the Host service then uses, and the model-visible effect of a writing selection is owned and documented by `@deepseek-ai/dsh-api-mode-dossiers`.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Target protection, the independent security proxy, and cross-conversation memory have no controls here because those capabilities are not implemented; the panels never present a switch that would not take effect.
- The reverse panel lists external bridges as not connected and offers no download or install action.
- The inventory is reloaded on demand and after each save; there is no filesystem watcher, so a change made by another process appears after the next reload.
- The selection editor is a checkbox per material; there is no drag ordering, and the Host renders materials in registry order.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Each panel is one list entry in `settings.mode.materials` and returns `null` for any other mode. That is what keeps a dialog's state alive across a mode switch: unmounting the entry would discard it. The owner passes `modeId`; the panel does not read the mode roster itself.

</details>
