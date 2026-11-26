---
kind: upgrade-guide
description: "Desktop updates use the DSHU release feed selected by the installed package."
---

# DSHU Desktop updates

English | [中文](guide.zh.md)

## Change

General settings no longer offers Stable and Development. Automatic checks and **Check for Updates** in the application menu use the package's DSHU release feed.

## Migration

When the release with five installers becomes Latest on GitHub, users of `2026.11.23.0` must download the matching installer and install it over their existing copy once. Version `2026.11.24.3` can discover the matching installer through **Check for Updates** in the application menu. After installation, confirm the DSHU version in **About**. Desktop keeps the existing preferences file. Clients using the Desktop preload API can use `updates.status()`, `updates.open()` and `updates.subscribe()`.
