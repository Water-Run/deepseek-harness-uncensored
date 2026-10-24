# Agent Note: Playbook packs as mode specialization

Status: implemented

English | [中文](2026-10-24-mode-specialization-playbooks.zh.md)

## Problem

The security, reverse-engineering, and writing modes were specialized by persona text, mode colors, and a short mode guide. The requirement attached to those modes asked for real capability and for open-source research with recorded licenses and tradeoffs. Prompt-only specialization fails three tests: the model cannot load a deeper manual when a task needs one, nothing durable survives context compaction, and the repository cannot point at a concrete artifact as evidence of the work.

The harness already had the right seam. `ctx.skills` merges provider catalogs, a preset mounts exactly the tools and providers its mode needs, and `dsh-tool-skill` exposes summaries with on-demand loading. `skill-office` demonstrated that a first-party package can ship instruction assets with resources.

## Decision

Add `@deepseek-ai/dsh-skill-playbooks`, one provider that ships three original packs and mounts only the pack a preset requests.

- Security, reverse, and writing presets each mount the provider with `packs: [<mode>]`; the standard preset does not mount it.
- Each pack ships field manuals as skills, reference tables as skill resources, and dependency-free Node scripts under `assets/shared/scripts/`.
- `casefile.mjs` and `sample.mjs` provide real storage and reproducible inventory: case directories under `.security/` or `.reverse/` with targets, evidence, findings, hashes, entropy, and a rendered report. Writing mode has no shell by design, so its continuity workflow uses plain files under `story/` written through the file tools.
- Preset personas name the mounted skills and the case conventions, so routing is visible without loading every manual.
- No third-party code is vendored. External projects are named in prose; the scripts are first-party.

### Open-source research and licenses

| Reference | Use in this work | License |
| --- | --- | --- |
| [`morluto/rea`](https://github.com/morluto/rea) | Confirmed the provider-bridge pattern for native, JS/Electron, .NET, APK, and adb analysis; named in the RE tool matrix | MIT |
| [`mrexodia/ida-pro-mcp`](https://github.com/mrexodia/ida-pro-mcp) | IDA MCP bridge named in the RE tool matrix; verified MIT license text | MIT |
| [`LaurieWired/GhidraMCP`](https://github.com/LaurieWired/GhidraMCP) | Ghidra MCP bridge named in the RE tool matrix | Apache-2.0 |
| [`swisskyrepo/PayloadsAllTheThings`](https://github.com/swisskyrepo/PayloadsAllTheThings) | Cross-checked payload coverage per vulnerability class; verified MIT license text; payload tables written independently | MIT |
| `Ghidra`, `radare2`/`rizin`, `Frida`, `JADX`, `apktool`, `capa`, `YARA`, `angr`, `z3`, `pwntools` | Named tools in the matrices; not bundled | Apache-2.0 / LGPL-3.0 / wxWindows / Apache-2.0 / Apache-2.0 / Apache-2.0 / BSD-3-Clause / BSD-2-Clause / MIT / MIT |

Writing craft guidance is original prose; no copyrighted style guide or sample text is reproduced. `SillyTavern` and `novelWriter` were reviewed as prior art for world-info and long-form organization; no code, data format, or text was copied (SillyTavern AGPL-3.0, novelWriter GPL-3.0, both merely informative).

## Alternatives considered

- **Instruction assets instead of new backends.** A Ghidra or IDA bridge, an engagement database service, or a cloud SDK integration would each be a package plus UI plus coverage work. The playbook packs deliver usable capability now and leave engine integration to the existing MCP and tool seams.
- **One package with three packs instead of three packages.** A single provider avoids three sets of manifests and gates; pack names keep catalogs disjoint, and a preset mounts one pack.
- **Scripts instead of new tools.** `casefile.mjs` and `sample.mjs` need no tool schema, presentation, or session event, so they run through the existing shell tool. The cost is that compositions without execution can read manuals but not run the scripts.
- **Original text instead of imported playbooks.** Importing HackTricks or PayloadsAllTheThings content would trigger license obligations and bring stale or off-voice material into model context. Naming tools keeps the packs license-clean and short.

## Consequences

- The three specialized modes now have a catalog of 22 loadable manuals with references and two runnable scripts; the persona routes into them by name.
- Cross-conversation reuse is a file convention, not hidden state: a new session reads the case directory or story bible and continues.
- Playbooks cannot install tools, hold licenses, or replace an analysis engine; the README and the TODO record that boundary.
- Future engine integration (Ghidra/IDA MCP, engagement UI, proxy, memory) attaches through the existing seams without rewriting the packs.
