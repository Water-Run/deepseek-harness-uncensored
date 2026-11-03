---
description: "Publication limits of local installed-update qualification."
---

# Installed-update publication status

English | [中文](README.zh.md)

## Local evidence

The [installed-update qualification](../README.md) records local package and installer observations. A receipt does not authorize uploading binaries, changing a public feed or replacing a release.

## Publication

The old COS test publisher and `publish-installed-update.ts` operator flow have been removed. The retained entry returns exit code 1 with migration guidance, including with `--execute`; it does not upload files, change feeds or decrypt credentials.

Preserve existing local artifacts and reports. Use the [DSHU publication policy](../../../publishing/README.md) for the release destination. Local update tests and transport substitutes do not establish real GitHub download or signed installed-upgrade behavior.
