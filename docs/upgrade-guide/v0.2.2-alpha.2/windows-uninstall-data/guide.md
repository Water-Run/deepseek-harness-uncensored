---
kind: upgrade-guide
description: "Windows uninstalls retain Electron user data unless cleanup is explicitly requested."
---

# Windows uninstall retains user data

English | [中文](guide.zh.md)

## Change

Windows uninstall preserves the Electron profile and updater cache by default. Scripts that relied on silent uninstall to clear that data must request cleanup explicitly. Both Harness homes remain protected.

## Migration

1. For a regular removal or reinstall, run the uninstaller with `/S`. Add `/KEEP_APP_DATA` when calling an older uninstaller.
2. To remove the Electron profile and updater cache intentionally, pass `/S /DELETE_APP_DATA=1` to the new uninstaller. Confirm that the application directory is removed and the Harness homes remain.
