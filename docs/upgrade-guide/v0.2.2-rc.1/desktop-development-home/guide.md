---
kind: upgrade-guide
description: "The Desktop development launcher uses DSH_DESKTOP_DEV_HOME for a custom Harness home."
---

# Desktop development uses a dedicated Harness home

English | [中文](guide.zh.md)

## Change

The launcher previously read `DSH_HOME` as a development override, while Desktop resolved its active home from `DSH_UNCENSORED_HOME`. The launcher now uses `DSH_DESKTOP_DEV_HOME` for an explicit development override and gives both Desktop and its Host the same path. The workspace default is `apps/desktop/.desktop-build/development/home`.

## Migration

1. For a custom home, set `DSH_DESKTOP_DEV_HOME` to the intended development directory when running `pnpm run dev:desktop` or `pnpm run start:desktop`.
2. Check the printed `DSH_UNCENSORED_HOME` path before working in the development window.
