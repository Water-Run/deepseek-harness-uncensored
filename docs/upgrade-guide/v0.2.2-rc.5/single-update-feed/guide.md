---
kind: upgrade-guide
description: "Desktop updates use the DSHU release feed selected by the installed package."
---

# DSHU Desktop updates

English | [中文](guide.zh.md)

## Change

General settings no longer offers Stable and Development. Automatic checks and **Check for Updates** in the application menu use the package's DSHU release feed.

## Migration

In an older installation, choose **Check for Updates** while the transition release is marked Latest on GitHub. If you previously selected Development, first change it back to the public release in Settings. Once a newer release becomes Latest, install its platform package manually to leave the old updater. Confirm the installed version in Settings. The transition release and subsequent versions check the latest public GitHub Release directly. Desktop keeps the existing preferences file. Clients using the Desktop preload API can use `updates.status()`, `updates.open()` and `updates.subscribe()`.
