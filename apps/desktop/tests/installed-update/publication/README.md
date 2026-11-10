---
description: "Publication limits of local installed-update qualification."
---

# Installed-update publication status

English | [中文](README.zh.md)

## Local evidence

The [installed-update qualification](../README.md) records local package and installer observations. A receipt does not authorize uploading binaries, changing a public feed or replacing a release.

## Publication

The old COS test publisher and `publish-installed-update.ts` operator flow have been removed. The retained entry returns exit code 1 with migration guidance, including with `--execute`; it does not upload files, change feeds or decrypt credentials.

Preserve existing local artifacts and reports. Each new qualification run pins a distinct DSHU GitHub release tag and the `nightly.yml` asset URL. Keep the same-version and upgrade scenarios in separate prereleases. The `files` command prepares local evidence for review. Publishing either prerelease requires separate authorization under the [DSHU publication policy](../../../publishing/README.md). Real GitHub download and signed installed upgrade require their own acceptance evidence.
