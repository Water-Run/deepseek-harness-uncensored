---
kind: upgrade-guide
description: "Menu consumers replace rectangle callbacks with CSS anchors; DSHU retains the positioning hook for statistics panels."
---

# CSS-anchored menus

English | [中文](guide.zh.md)

## Change

`Menu` replaces `getAnchorRect` with `anchorRef` for an external trigger element or `anchorPoint` for a point-triggered menu. Custom Client UI that passes the removed prop must migrate. DSHU retains the `useAnchoredPosition` value export and `AnchoredPositionOptions` type export for its statistics popovers; existing imports remain supported.

Portaled menus follow their anchors through CSS Anchor Positioning. Their size limits use the layout viewport; browser zoom and panning move them with the page, and the panels may extend beyond the visual viewport, including while the keyboard is open. Menu dismissal, keyboard navigation, and internal scrolling remain available. The browser must support the CSS anchor positioning properties used by the component.

## Migration

1. For a CSS-anchored custom panel, give its trigger a unique `anchor-name` and set the panel's `position-anchor` to the same name. Define placement and size limits in CSS; see the [model selector](../../../../packages/client/ui-model-selection/README.md#understand-the-implementation). Panels that require the retained JavaScript positioning hook may continue using it.
2. When `Menu.getAnchorRect` returned a trigger's rectangle, pass the trigger's element ref as `anchorRef` instead. An inline `anchor` rendered by `Menu` needs no external ref.
3. When the callback returned a zero-size rectangle for a pointer gesture, pass `{ x, y }` as `anchorPoint` in the same client-viewport coordinates as `event.clientX`/`clientY` or `getBoundingClientRect()`. `Menu` performs the Safari-to-layout conversion when opening or changing the point; callers must not add the visual-viewport offset themselves.
4. Rebuild the custom Client UI and check that the removed prop is absent. Verify opening, scrolling, Escape, focus restoration, and selection before and after browser zoom. CSS-anchored menu assertions must allow visual-viewport overflow while retaining layout-viewport bounds and content access.
