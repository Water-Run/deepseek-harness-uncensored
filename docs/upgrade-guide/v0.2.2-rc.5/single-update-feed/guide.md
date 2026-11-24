---
kind: upgrade-guide
description: "Desktop updates use the DSHU release feed selected by the installed package."
---

# DSHU Desktop updates

English | [中文](guide.zh.md)

## Change

General settings no longer offers Stable and Development. Automatic checks and **Check for Updates** in the application menu use the package's DSHU release feed.

## Migration

No action is required. An existing Development selection also receives the package feed. Desktop retains other preferences and leaves the original file in place. Clients using the Desktop preload API can use `updates.status()`, `updates.open()` and `updates.subscribe()`.
