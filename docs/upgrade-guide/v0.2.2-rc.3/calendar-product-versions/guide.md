---
kind: upgrade-guide
description: "DSHU installers and user-visible versions adopt YYYY.MM.DD.N calendar numbering."
---

# Calendar product versions

English | [中文](guide.zh.md)

## Change

DSHU uses `YYYY.MM.DD.N` for displays, installer names and Windows registration. Package manifests and update feeds encode the same ordered version as `YYYY.MMDD.N`. The DSH engine version is independent. Earlier `0.1.0` installations can upgrade to calendar builds.

The private CLI and runtime payloads carry the selected build version rather than the checkout baseline. Rebuild inspection packages whose CLI still reports the earlier baseline; Session data does not need migration.

## Migration

1. Build locally with `--build-version auto`, or pass a public version such as `2026.11.14.2` for the same Windows/Linux source. Keep retained delivery files when cleaning build caches.
2. CI `build-number` mode requires a unique `PACKAGE_BUILD_SEQUENCE` per daily attempt; manual mode accepts the public calendar version. Legacy run/attempt suffixes apply only to earlier semantic product versions.
3. Keep the generated update feed's runtime version; its installer path uses the public calendar format. Confirm the installed About page, CLI and Windows registration show the intended public version.
