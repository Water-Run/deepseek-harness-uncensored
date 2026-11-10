---
kind: upgrade-guide
description: "Windows installers reject replacement of a newer registered Desktop product version."
---

# Windows installer version checks

English | [中文](guide.zh.md)

## Change

Windows installers compare their independent Desktop product version with the current user's registered DSHU version before replacing an installation. An older candidate is rejected. A missing version for an existing registered executable, or an invalid version, also stops installation. Silent setup returns exit code 2. Same-version repair and upgrades are accepted. The check follows SemVer precedence, including numeric prerelease fields.

## Migration

1. For an upgrade or repair, use an installer with the same or a newer Desktop product version.
2. For an intentional rollback, back up the DSHU data directories and uninstall the current application first. Normal uninstall retains user data. Confirm the target version supports those data formats before opening it.
3. Confirm the resulting version in About and the Windows uninstall entry. Installers built before this check retain their original behavior.
