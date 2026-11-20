---
description: "DSHU user guide covering setup, the four modes, side and quick questions, balance and spending limits, memory, tools, data recovery, and troubleshooting."
---

# DSHU user guide

English | [中文](dshu.zh.md)

## Summary

DSHU is an independent DeepSeek Harness fork maintained by WaterRun, with built-in armor prompts, four modes, and a separate desktop application. This guide starts after desktop installation or Web server startup and explains model setup, tasks, auxiliary conversations, spending, and persistent reference material. DSHU and the official app keep separate configuration and sessions; model capabilities, availability, and charges depend on your provider. The [development checklist](../../../.agents/TODO.md) owns delivery status and verification scope: unreleased source changes are not necessarily in your installed build.

## Table of contents

- [Complete your first task](#first-task)
- [Choose a mode](#modes)
- [Main, side, and quick questions](#conversations)
- [Balance, session cost, and spending limits](#spending)
- [Memory, materials, and input prediction](#memory)
- [Tools, plugins, and REA](#tools)
- [Appearance and defaults](#defaults)
- [Data, updates, and recovery](#data)
- [Troubleshooting](#troubleshooting)
- [Further exploration](#further-reading)
- [Dev Note](#dev-note)

-----

<a id="first-task"></a>
## Complete your first task

For your first task, pick something bounded whose result you can check. Confirm that the model connection works before widening the scope.

1. Open **Settings → Models**, configure the provider, endpoint, and credentials, save, and select a model. Third-party endpoints also require the correct protocol and model ID; see [model configuration](providers.md).
2. Create a session and choose a workspace. Select the project directory for file tasks; for general questions, choose **Work without a workspace** instead of creating a directory just to send a message.
3. Select a mode before the first message. Default supports general tasks; Security, Reverse, and Writing add their own materials and workflows. Existing sessions keep their original mode by default.
4. Describe the inputs, expected result, and verification method, then send. Attach required files or images; the model cannot read materials you have not supplied.
5. Review actual changes, execution results, and remaining work. Preserve tool errors, missing dependencies, and unexecuted checks as follow-up items.

For example, send this in an existing project workspace:

> Find this project's entry points and startup procedure, and explain why the build fails. Fix it, run the affected checks, and report changes, verification results, and remaining issues.

A useful result identifies specific files or observations and states whether checks actually ran. Advice alone does not establish that changes or verification occurred.

<a id="modes"></a>
## Choose a mode

Modes select specialized materials, workflows, and tool combinations. All four share built-in armor prompts; models can still make mistakes, so assess results through files, execution, and review. **Mode explanation** and **How to use** in Settings open guides without changing the session. Existing sessions can switch only while idle and after switching is temporarily allowed.

### Default: development and everyday tasks

![Default mode, theme color blue](../../assets/dshu/mode-default.svg)

Default can read and edit files, run commands, retrieve information, and use collaboration and workflows as needed. Use it for fixes, repository exploration, research organization, and executable deliverables. Supply the project path, observed failure, and completion criteria before asking the agent to investigate, change, and verify.

> Reproduce this endpoint error, find the cause, and verify normal and invalid inputs after fixing it. Distinguish code-based inference from checks that actually ran.

**What to check:** changed files, trigger conditions, verification commands, and results are present; unexecuted checks have an explicit reason.

### Security: investigation, evidence, and verification

![Security mode, theme color red](../../assets/dshu/mode-security.svg)

Security provides seven field-manual areas, case records, reports, and an independent proxy. New Security sessions require responsibility confirmation. Cases under `.security/` can preserve targets, evidence, findings, and pending work for later conversations. Providers, models, and execution environments determine which tasks can run; manuals do not install external tools.

> Review authentication and uploads in this test application, reproduce suspected issues locally, identify affected locations, fix and test them, and save evidence and unresolved questions in the case record.

**What to check:** findings identify targets, locations, and reproduction conditions, and distinguish observations, hypotheses, and unexecuted checks. Enable the proxy separately when needed; its disabled-state reminder is configurable. Target, server, and database protections default to off, and selecting Security does not enable them. Review [execution coverage and limitations](../../../packages/guard/target-protection/README.md) before enabling protection.

### Reverse: samples, call paths, and protocols

![Reverse mode, theme color green](../../assets/dshu/mode-reverse.svg)

Reverse provides eight analysis-manual areas, `.reverse/` case records, and bundled REA. Investigate program behavior, file formats, protocols, and runtime observations. Preserve the original sample, supply platform and architecture clues and representative inputs, and choose suitable tools; keep modified samples and outputs separately.

> Record this sample's hash and architecture, locate the parser entry point, trace important calls, verify conclusions with independent inputs, and save scripts and unresolved hypotheses.

**What to check:** sample identity, addresses or offsets, call or runtime evidence, reusable scripts, and uncertainty are clear. REA is bundled; optional engines such as Ghidra, Java, IDA, and Hopper require separate configuration. A successful connection check does not establish that every engine, license, or target process is ready.

### Writing: setting, voice, and long-form continuity

![Writing mode, theme color gold](../../assets/dshu/mode-writing.svg)

Writing supports fiction, scripts, and long-form text through style references, a six-axis style card, and `story/bible/` materials. Only selected materials enter model requests. Manage references and settings in mode configuration, and continue later conversations from retained materials. The Writing composition does not mount terminal or code-execution tools.

> Continue the next scene using the selected character materials and style reference. Preserve viewpoint, chronology, and available information, check setting conflicts, and deliver the complete scene.

**What to check:** the text follows the requested length, viewpoint, and relationships; setting conflicts and unresolved details are identified separately. For a long work, establish characters, chronology, and world rules before proceeding scene by scene.

<a id="conversations"></a>
## Main, side, and quick questions

The main conversation advances the task, side questions support continued discussion, and quick questions handle brief checks. Side and quick questions do not copy the main history into ordinary sidebar sessions.

| Entry | Use it for | History and behavior |
| --- | --- | --- |
| Main composer | Advance the task or send new requirements | Keeps main history; sending while busy follows the configured send behavior. |
| `/side question` | Continued questions, explanations, or images | Opens the side conversation and sends the question; `/side` alone opens or reopens it. |
| `/btw question` | One brief check | Shows a short reply in the main conversation without creating an ordinary session. |
| `/clear` inside the side conversation | Start the side discussion again | Clears its own history; main history remains, and the side conversation can still reference it. |

Each side question can reference newly completed main progress and retains independent history. The main conversation can actively inspect the related side conversation. Do not assume that discussing an action in the side conversation sends a new execution instruction to the main conversation.

Closing a side conversation preserves its history by default. Enable **Clear side context on close** in Settings to clear it automatically; this defaults to off. `/clear` works only inside the side conversation and cannot clear the main conversation.

Side questions support image attachments. Describe the location or symptom to inspect and use an image-capable model; successfully attaching a file does not establish provider support for its type.

![A quick-question answer shown in the main conversation](../../assets/dshu/quick-question-light.png)

<a id="spending"></a>
## Balance, session cost, and spending limits

These answer different questions: balance is the latest account sample, session cost is locally estimated task spending, and limits are the local spending controls you enable. They cannot substitute for one another or for the provider's bill.

### Inspect balance and history

The compact sidebar balance card opens statistics or refreshes the balance. Sampling defaults to 15 seconds, with a minimum configurable interval of 3 seconds. The public API does not expose complete history, so the curve accumulates local samples. Hover, touch, or focus and use arrow keys to inspect a time and amount.

Balance increases such as top-ups use vertical dashed lines. Long unchanged intervals use shortened horizontal dashed lines so they do not crowd out earlier changes. Balance differences can include top-ups, gifts, and expiry deductions; they are not the current session's cost.

### Configure independent limits

Settings → Quota offers 15-minute, 1-hour, 5-hour, 1-day, 7-day, and 30-day windows. New installations disable all of them. The 5-hour and 7-day rows appear first; expand the others as needed. Each has its own switch, amount, and reset, with actions to disable or reset all below.

Requests reserve estimated cost before execution and settle against returned usage, so pending requests can temporarily consume available quota. Resetting changes local limit statistics; it neither tops up the account nor reverses provider charges. The [spending-control reference](../../../packages/guard/spend-limit/README.md) owns estimation, reservations, and failure handling.

### When a limit is reached

The pause banner should identify the reason, the estimated recovery time when available, and a reset action. Wait for the rolling window to recover, or deliberately change, disable, or reset the relevant limit. Paused work resumes automatically after recovery only when automatic recovery is enabled. Settlement of other requests can also release reserved quota.

The footer amount opens the session cost curve; its limit item opens progress for enabled windows. Provider balance exhaustion, authentication failures, and network failures are separate errors: resetting local statistics cannot repair them.

<a id="memory"></a>
## Memory, materials, and input prediction

Cross-session memory stores retrievable long-term information, while mode materials provide references for the current work. Both require a deliberate scope. Neither automatically appends every other conversation's full history to each request.

- **Long-term facts and preferences:** use structured memory, with available scopes for search, review, and editing. Automatic extraction defaults to off; enabling it produces model calls charged under the provider's rules.
- **Detailed project or case evidence:** keep it in workspace files or `.security/` and `.reverse/` case files. Selected Security case notes can enter reviewed memory, scoped by default to the current workspace and Security mode; case files remain the detailed evidence source.
- **Writing materials:** select style references and setting materials in mode configuration, and deselect unnecessary items. Saving materials in the list does not by itself include them in model requests.
- **Input prediction:** defaults to on and predicts separately for main, side, and quick-question drafts. Gray text is a suggestion; Tab inserts it, and you decide whether to send. Prediction calls the selected model and can incur charges.

If replies reuse incorrect context, inspect selected materials, memory scope, and side history before editing memory, deselecting materials, or using side `/clear`. Deleting a session and editing long-term memory are separate operations.

![The input prediction switch in General settings](../../assets/dshu/input-prediction-settings-light.png)

<a id="tools"></a>
## Tools, plugins, and REA

The desktop app bundles REA, so REA itself needs no separate installation. Settings → Modes → Reverse configuration can check its connection and configure optional engines. About and the [REA reference](../../../packages/mcp/rea/README.md) identify its version, repository, and pinned source commit. Configuration changes rebuild the connection; previously opened samples must be reopened.

Plugins extend model providers, tools, and UI; MCP connects external tool services. After configuration, run a small, bounded task and check the execution backend, output, and failure reports. Plugin visibility, tool discovery, and successful execution are separate checks. External programs, credentials, and licenses still have their own requirements.

The independent Security proxy applies only to supported execution paths. Connection metadata does not establish inspection of encrypted bodies; terminal programs must also honor proxy settings. Optional protection settings report executor coverage. A switch alone cannot establish protection for unsupported protocols, remote environments, or inbound scenarios.

<a id="defaults"></a>
## Appearance and defaults

Mode colors identify the task: blue for Default, red for Security, green for Reverse, and gold for Writing. Appearance supports system, light, dark, and sunrise/sunset settings. Guides use their mode's color without changing the current conversation.

| Setting | New-install default | Meaning |
| --- | --- | --- |
| New-session mode | Default | Choose another mode before the first message. |
| Switching existing sessions | Disallowed | Temporarily allow it in Settings and wait until the session is idle. |
| Six spending limits | All off | The 5-hour and 7-day rows are prominent, not automatically enabled. |
| Automatic quota recovery | Off | When enabled, paused work continues after quota recovers. |
| Target, server, and database protection | Off | Optional advanced configuration; check coverage per executor. |
| Balance sampling | 15 seconds | Minimum configurable interval: 3 seconds. |
| Input prediction | On | Uses the selected model and may incur charges. |
| Clear side context on close | Off | Send `/clear` inside the side conversation when needed. |
| Automatic memory extraction | Off | Select the intended scope and review saved results when enabling it. |

These are initial settings for new installations. Updates preserve existing configuration, so defaults do not establish your current switch states.

<a id="data"></a>
## Data, updates, and recovery

DSHU has its own application identity and data directory. The default data root is `~/.dsh-uncensored`, overridden by `DSH_UNCENSORED_HOME`. The official app and DSHU can coexist without automatically sharing configuration or sessions. An application-data backup does not necessarily include workspace files, external-tool data, or provider billing records.

Versions use `YYYY.MM.DD.N`, with a daily build sequence in the final position. About distinguishes the DSHU version, underlying DSH version, author WaterRun, build metadata, and dependency sources. The date version does not replace DSH's or REA's own version.

Close DSHU before updating, and back up its data directory and important workspace files. Use an installer explicitly identified as DSHU for your platform, and inspect data-removal choices during uninstall. Formal signing, online upgrading, OS-restart behavior, and automatic rollback have not completed release qualification; see the [delivery record](../../../.agents/HANDOFF.md) for inspection-build verification and recovery points. Do not let an older application write newer data without verified compatibility.

<a id="troubleshooting"></a>
## Troubleshooting

Record the actual error, time, mode, and reproduction steps before narrowing the problem to models, tools, quota, or UI. Include screenshots and version information in reports, with credentials redacted.

| Symptom | Check first | Next step |
| --- | --- | --- |
| Model does not respond | Provider, model ID, protocol, credentials, and original error | Follow [model configuration](providers.md); resetting local quota cannot fix authentication or server limits. |
| Task stays paused | Quota banner, enabled windows, and pending reservations | Wait for settlement or recovery, or reset the relevant window; check automatic recovery. |
| `/side question` shows unexpected content | Whether it was sent in the main composer and opened the related side conversation | Reopen with `/side` alone; use `/clear` inside the side conversation for a fresh history. |
| Side question cannot interpret an image | Attachment completion and model image support | Select an image-capable model and specify the inspection target. |
| Reading a guide does not change mode | Current session mode and switching lock | Help does not switch modes; select before a new session's first message, or temporarily allow switching. |
| REA connects but analysis fails | Relevant engine, path, environment, permissions, and license | Test actual execution with a small sample and preserve the full error; discovery is not engine qualification. |
| Session deletion reports an error | Session, subtasks, running state, and error text | Preserve a screenshot and version and [report the issue](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose); do not repair it by manually deleting database files. |
| Balance history is incomplete | Sampling start and compressed unchanged intervals | Keep accumulating samples; the public API cannot recover the complete unsampled history. |

<a id="further-reading"></a>
## Further exploration

Use the topic owners for configuration and developer detail. The checklist owns progress and delivery state.

- [Project introduction](../../../README.md): capabilities, modes, and project sources.
- [Model configuration](providers.md): providers, custom protocols, and credentials.
- [Mode materials](../../../packages/client/ui-mode-materials/README.md): style references and setting management.
- [REA integration](../../../packages/mcp/rea/README.md): engine setup, connections, and limitations.
- [Execution protection](../../../packages/guard/target-protection/README.md): optional rules, coverage, and audit.
- [Development checklist](../../../.agents/TODO.md): completed, ongoing, and future work.
- [Packaging and delivery](../../../apps/desktop/packaging/README.md): platforms, versions, and validation.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Maintenance</summary>

This guide explains product use without replacing delivery status, original requirements, or package references. Check code and acceptance evidence before adding features, then update both language versions. The Worker preview backend under development is not an installed-desktop capability.

</details>
