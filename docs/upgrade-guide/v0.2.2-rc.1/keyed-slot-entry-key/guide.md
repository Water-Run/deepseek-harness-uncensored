---
kind: upgrade-guide
description: "TypeScript calls that render a keyed child Slot require an explicit entryKey."
---

# Keyed Slot render options

English | [中文](guide.zh.md)

## Change

In the client Slot API, `PropsRenderSlots` requires `entryKey` in calls to `renderSlot` for a keyed child, including children with `hookContext`. A missing key previously compiled and rendered the fallback. A supplied key with no registered entry still renders the fallback.

## Migration

1. Find each keyed child rendered by `renderSlot` and pass its dispatch key as `opts.entryKey`. Keep any key-specific owner props and occurrence context with that call.
2. If the caller has no selected key, render its fallback directly in that branch.
3. If a test supplies its own `renderSlot` implementation for both kinds, annotate the parameters explicitly.
4. Build the artifacts and run `pnpm run build:check` to verify the callers.
