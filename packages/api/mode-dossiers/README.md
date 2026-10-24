---
description: "Mode-owned dossier storage and its settings surface: security and reverse-engineering case ledgers, the writing-materials registry with its request context, and read-only sample inventory."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-mode-dossiers

English | [中文](README.zh.md)

## Summary

Use this package to manage the files the specialized modes already keep. Security and reverse-engineering cases are the `case.json` ledgers `casefile.mjs` maintains under `.security/` and `.reverse/`; writing materials are the documents under `story/style/` and `story/bible/` plus the registry that records which of them a writing request receives. This package owns storage and the request context; the settings panels are `@deepseek-ai/dsh-client-ui-mode-materials`.

Every read and write goes through the composed filesystem with a workspace-relative path, so a request can never name a file outside the workspace it was bound to. Writes carry the version the editor opened: a file another window or script changed since then is reported as a conflict and left untouched.

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

Mount the package beside `dsh-fs`, the Workspace registry, and the Typert Gateway. The Client half lives in `@deepseek-ai/dsh-client-ui-mode-materials`, which registers three panels into `settings.mode.materials`, the slot the mode settings section renders under its cards.

| Method | Returns | Purpose |
|---|---|---|
| `inventory(scope)` | `DossierInventory` | Workspace identity, both case lists, the writing registry, and the tool status this Host actually reaches |
| `readCase({ kind, slug })` | `DossierCaseView` | One validated ledger with its freshness token |
| `createCase({ kind, slug, objective })` | `DossierCaseView` | One empty ledger, identical to `casefile.mjs init` |
| `mutateCase({ kind, slug, expectedVersion, mutation })` | `DossierCaseView` | One edit applied under the version guard |
| `report({ kind, slug })` | `DossierReport` | The Markdown report `casefile.mjs report` prints |
| `readStory({ path })` | `StoryEntryDocument` | One writing document with its version |
| `writeStory({ path, expectedVersion, markdown })` | `StoryEntryDocument` | Replace one document under its version guard |
| `createStory({ section, name, title, markdown })` | `StoryEntryDocument` | Create one document and register it as selected |
| `adoptStory({ path })` | `DossierInventory` | Record a document the workspace already holds |
| `removeStory({ path })` | `{ selected }` | Drop a registry record; the document stays |
| `selectStory({ selected })` | `{ selected }` | Replace the material set writing requests receive |
| `inspectSample({ path })` | `SampleInspection` | Hash, container format, entropy, and bounded strings read from bytes |

### Storage layout

A security case is `.security/<slug>/case.json`; a reverse-engineering case is `.reverse/<slug>/case.json`. Both are format version 1 documents with `targets`, `evidence`, `findings`, and `notes` arrays, so a file written here is a file the playbook script reads and the other way round. Fields this build does not model — a top-level key another tool added, an extra field on a record — stay on disk: mutations edit the parsed object in place and only the fields they own are replaced.

Writing materials are `story/style/*.md` and `story/bible/*.md`. The registry `story/materials.json` records the managed paths, their titles and sections, and the current selection. A Markdown file in those two directories that the registry does not know yet is listed as unregistered and can be adopted rather than overwritten.

### Version guards and conflicts

There is no lock file. A write compares the file's current version with the version the request carries and writes with the backend's own guarded replacement, so a concurrent writer changes the outcome from "saved" to `mode-dossier/conflict` instead of losing an edit silently. A conflicting request is not applied and its text is never stored.

### Failures

Storage conditions arrive as reported problems on `inventory` — no workspace, a workspace whose directory disappeared, an unreadable directory, a malformed file, or a format version this build does not read — and as Remote failures elsewhere with the same codes. A corrupt ledger is listed beside the usable ones instead of hiding the whole list. Malformed input never rewrites the stored file.

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/casefile.ts` owns ledger validation, mutation, serialization, and report rendering; `src/story.ts` owns the registry, the document reads, and the selection; `src/sample.ts` computes the inventory from bytes; `src/tools.ts` publishes the tool status; `src/index.ts` is the Remote service and the pre-step context. The panels live in `@deepseek-ai/dsh-client-ui-mode-materials`.

## Further Exploration

- [Mode specialization playbooks](../skill/skill-playbooks/README.md) — the skills that read these files and the script formats they document.
- [Workspace file service](../workspace-files/README.md) — the read-only file surface this package does not duplicate.

<a id="model-experience"></a>
## Model Experience

The package contributes one model-visible input: a Writing-mode request whose registry holds a non-empty selection receives a user-role message listing the selected documents under `### <path>` headings. The message is ordinary session history — it persists, replays, and compacts like any other user message — and it is emitted once per changed selection rather than once per step. Documents that are not selected are never read into it, and an unreadable store leaves the request unchanged. Token cost is bounded by `contextBytes` (16 KiB by default) with a per-document cap, and a cut document is marked as truncated.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- Target protection (domestic domains, production servers and databases) is not implemented. A target is case data only; recording one does not block anything, and the panel says so.
- The independent security proxy is not implemented, so nothing here manages proxy settings or traffic.
- Cross-conversation structured memory is not implemented. These files survive sessions because they are workspace files, which is not the same capability, and the surface does not claim it.
- External reverse-engineering bridges (IDA Pro, Ghidra, REA, Frida) are reported as not connected. This build never downloads, installs, or probes them.
- Deleting a writing record removes the registry entry only; the document is kept. Deleting a case record rewrites `case.json` and touches no sample or evidence file.
- `inspectSample` reads one complete file through `readBytes`, so the cap bounds memory rather than streaming a huge sample.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The settings section owns the `settings.mode.materials` slot; this package only contributes to it. The slot owner passes `modeId`, and each panel renders nothing unless it owns that mode. Keep that contract when adding a fourth mode: the panel receives the current mode's identity, not a copy of the mode list.

</details>
