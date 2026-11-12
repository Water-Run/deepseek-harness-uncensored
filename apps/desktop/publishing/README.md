---
description: "DSHU release destination and migration from retired upstream publishing tools."
---

# DSHU publication

English | [中文](README.zh.md)

## Summary

DSHU uses [its own GitHub Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases). Building an installer neither uploads files nor creates a release tag. The DSHU product version is independent of the embedded DSH engine version.

## Distribution

Use the [packaging commands](../packaging/README.md) to prepare and verify local artifacts. Retain the source commit, product and engine versions, build time, hashes and qualification result with each deliverable. Unsigned inspection builds remain distinct from signed releases; changing the filename does not qualify an artifact.

Signed packages use the fork's GitHub latest-release asset directory as their update feed. Differential downloads from this feed request one byte range at a time. Windows downloads the full signed artifact when a required blockmap or cached installer is unavailable. Unsigned packages do not contain an automatic-installation feed. Release publishing and signed installed-upgrade acceptance remain separate from local build success.

## Retired upstream tools

The COS transport, EdgeOne cache refresh, upstream retention/publishing/rollback implementation and credential decryption launcher have been removed. Legacy upload, publication, rollback, retention and publication-preflight entry files return exit code 1 with a GitHub Releases migration message before reading deployment configuration or credentials. No replacement command automatically publishes a release.

Stop invoking `upload-target.ts`, `publish-desktop-ci.ts`, `publish-installed-update.ts`, `rollback-desktop-channel.ts`, `retain-desktop-ci.ts`, `resolve-desktop-publish-ci.ts`, `resolve-retained-desktop-publish-ci.ts`, `archive-desktop-ci.ts`, `publish-desktop-rollout-ci.ts`, `publish-website-ci.ts`, either `preflight-desktop-publish*.mjs` entry or `upload-with-credentials.ps1`. Existing local installers and qualification records are not removed. Do not reuse the upstream download origin, bucket, cloud keys or publication routing files for DSHU.

The current repository has no active release workflow; see the [CI status](ci/README.md). A release must identify this repository and the reviewed DSHU artifacts explicitly.
