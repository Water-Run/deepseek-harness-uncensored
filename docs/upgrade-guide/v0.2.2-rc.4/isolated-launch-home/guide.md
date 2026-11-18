---
kind: upgrade-guide
description: "DSHU launchers require a data directory separate from the official DeepSeek Harness home."
---

# Separate DSHU data directory

English | [中文](guide.zh.md)

## Change

DSHU Desktop and CLI reject a selected data directory that overlaps the official default `~/.dsh`, including through directory links and Windows junctions. Desktop resolves a relative `DSH_UNCENSORED_HOME` from its startup directory and passes that absolute path to the Host.

## Migration

1. Set `DSH_UNCENSORED_HOME` to your separate DSHU data directory. Use an absolute path if you launch Desktop and the terminal command from different locations.
2. Correct any directory link that resolves to `~/.dsh` or a parent or child of it. Keep the official application's data in place.
3. Reopen DSHU and confirm that it loads the expected settings and sessions from the selected directory.
