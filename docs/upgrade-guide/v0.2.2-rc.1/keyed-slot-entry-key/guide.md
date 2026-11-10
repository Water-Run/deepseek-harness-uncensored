---
kind: upgrade-guide
description: "Slot render calls require matching inputs and an explicit key for keyed children."
---

# Slot render inputs

English | [中文](guide.zh.md)

## Change

In the client Slot API, `PropsRenderSlots` requires `entryKey` in calls to `renderSlot` for a keyed child, including children with `hookContext`. A missing key previously compiled and rendered the fallback. A supplied key with no registered entry still renders the fallback.

When a Slot name or key varies independently of the other inputs, the call must supply inputs that satisfy every possible target. For a Slot with a keyed prop table, each alternative in a `KeyedRenderSlotArgs` tuple union keeps the key and its matching inputs together. Owner props passed to `renderSlotChain` must satisfy each possible Slot.

## Migration

1. Find each keyed child rendered by `renderSlot` and pass its dispatch key as `opts.entryKey`. Keep any key-specific owner props and occurrence context with that call.
2. For an independent dynamic Slot name or entry key, pass inputs that work for every candidate or narrow the name or key before rendering.
3. For a keyed Slot whose key and inputs are selected together, form a `KeyedRenderSlotArgs` tuple and call `renderSlot(...args)`.
4. If the caller has no selected key, render its fallback directly in that branch.
5. If a test supplies its own `renderSlot` implementation for both kinds, annotate the parameters explicitly.
6. Build the artifacts and run `pnpm run build:check` to verify the callers.
