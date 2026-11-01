---
description: "Browser-use capability packages for selecting and registering one browser backend."
kind: "package-group"
---

# packages/browser-use

English | [中文](README.zh.md)

## Summary

Browser-use providers let models inspect and operate web pages. This group owns exclusive provider registration. Experimental providers supply browser tools and manage each Session's browser resources.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Choose one provider and mount the shared registration service.

| Package | Role | ctx key |
|---|---|---|
| [`browser-use`](browser-use/README.md) | Exclusive named provider registration | `ctx.browserUse` |

<a id="related-documentation"></a>
## Related documentation

- [Browser use](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/docs/subsystems/browser-use.md) — capability ownership and provider choices.
- [Experimental packages](../experimental/README.md) — Playwright MCP, Chrome DevTools MCP, and Stagehand providers.

<a id="dev-note"></a>
## Dev Note

None.
