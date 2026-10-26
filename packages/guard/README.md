---
description: "Package map for execution policies, spending limits, security proxying and target protection."
kind: "package-group"
---

# guard/ — execution policies

English | [中文](README.zh.md)

## Summary

The `guard/` group owns tool repetition reminders, call deadlines, spending limits, security-mode proxying and target-policy enforcement. Package READMEs describe their actual coverage and activation. Target protection is an optional integration under development and is not enabled in the default product.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Each package owns its policy or execution capability.

| Package | What it provides |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.md) | Reminds the model when it repeats the same tool call, so it changes approach or finishes |
| [`timeout-policy/`](timeout-policy/README.md) | Times out tool calls that declare a limit, so the model gets a clear error instead of waiting forever |
| [`spend-limit/`](https://github.com/Water-Run/deepseek-harness-uncensored/blob/main/packages/guard/spend-limit/README.md) | Reserve and account for model spending, pause and resume requests (Chinese reference) |
| [`security-proxy/`](security-proxy/README.md) | Define security-mode proxy routing and capture operations |
| [`security-proxy-local/`](security-proxy-local/README.md) | Configure the local proxy and retain bounded traffic records |
| [`target-protection/`](target-protection/README.md) | Persist target rules and guard HTTP connections; other execution adapters remain unfinished |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the tools subsystem reference for the tool-call pipeline, then the reminder's configuration and the timeout-library decision behind the policy.

- [Tools service](../core/tools/README.md) — the tool-call pipeline and execution decisions.
- [Reminder configuration](repeat-tool-reminder/src/index.ts) — accepted fields of the repeat-call reminder.
- [Timeout deadline library Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md) — the timing/termination split `timeout-policy` enforces.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
