---
description: "Bundled security, reverse-engineering, and writing playbooks that give the specialized session modes field manuals, references, and helper scripts instead of persona text alone."
kind: "package-reference"
---

# @deepseek-ai/dsh-skill-playbooks

English | [中文](README.zh.md)

## Summary

The package ships three original playbook packs and registers the selected pack on `ctx.skills`. A preset mounts one pack, so the security, reverse-engineering, and writing modes each carry a dozen field manuals, reference tables, and dependency-free Node scripts. The catalog summary is always visible; a playbook body loads only when the model selects it. No third-party code is vendored: tools are named in prose, and every shipped script is first-party.

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

Mount it beside the skill registry and `dsh-tool-skill`. The preset rows in `@deepseek-ai/dsh-web-app` already do this for the three specialized modes.

```yaml
- name: '@deepseek-ai/dsh-skill-playbooks'
  config:
    packs:
      - security
```

| Field | Default | Meaning |
|---|---|---|
| `packs` | none | Packs to expose. An empty list mounts no provider, so a composition can keep local discovery only. |
| `assetRoot` | packaged `assets/` | Absolute directory containing the three pack folders. |

| Pack | Skills | Helper scripts |
|---|---|---|
| `security` | engagement, reconnaissance, web attack, network exploitation, payload lab, cloud/container, reporting | `shared/scripts/casefile.mjs` |
| `reverse` | triage, static, dynamic, protocol, patch/keygen, mobile, malware, casebook | `shared/scripts/casefile.mjs`, `shared/scripts/sample.mjs` |
| `writing` | craft, voice, scene, dark material, continuity, style reference, long-form | none; the mode writes files through the file tools |

The two scripts are plain Node with built-in modules only. The ledger keeps targets, evidence, and findings in `case.json` per case and renders a Markdown report; the inventory streams a sample once to produce hashes, format, entropy, and strings. Loaded skills print their resource directory, so a playbook can address `../../shared/scripts/...` without configuration.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Registration reads each configured pack's skill directories synchronously, parses YAML frontmatter, and fails loud on a missing pack, a missing description, or a duplicate name. Bodies are read on demand; a removed file returns `undefined` instead of a stale body. Candidates use `bundled` source and the standard bundled rank, and disposal removes every candidate through the registry registration.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Pack discovery, frontmatter parsing, catalog candidates, on-demand loading. |
| [`assets/`](assets/) | Three playbook packs plus shared scripts. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill registry](../skill/README.md) — provider precedence and catalog merging.
- [Skill tool](../tool-skill/README.md) — model-facing catalog and `skill` loader.
- [Web app bundle](../../bundle/web-app/README.md) — the preset rows that mount each pack.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-skill`: the initial catalog lists the selected pack's summaries, and `skill(name)` returns the requested body with its resource directory. The playbook then routes to references and scripts on its own.

#### KV Cache effect

Skill results append to history without changing tool declarations. Catalog summaries stay small; bodies load only when selected. A loaded playbook remains in history for the rest of the session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Playbooks are instructions and local scripts, not analysis engines: the host must provide the named tools, licenses, and network access.
- The security and reverse packs assume the built-in shell tool; compositions without execution can read the manuals but cannot run the ledger or inventory scripts.
- Writing mode deliberately mounts no shell, so its continuity workflow relies on the file tools rather than a script.
- Tool and license facts in the reference tables are dated; verify them before redistributing anything that embeds a third-party tool.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Open-source references used to shape the packs (REA, ida-pro-mcp, GhidraMCP, PayloadsAllTheThings and the named tools) are cited in `.agents/notes/` with their licenses. Nothing from those projects is copied into the assets; the scripts are original.
</details>
