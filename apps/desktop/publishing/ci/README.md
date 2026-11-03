---
description: "Current DSHU CI publication status."
---

# DSHU release automation

English | [中文](README.zh.md)

## Status

This checkout has no active GitHub Actions release workflow. Local packaging remains available through the [packaging entry](../../packaging/README.md); it does not publish artifacts.

The upstream original-runner selection, retained-attempt store, cloud publisher and channel rollback have been retired. Their remaining command files only report the migration destination and exit unsuccessfully, including `--check`, `--publish` and `--execute` invocations. They do not read GitHub job records, machine publishing configuration or upload credentials.

## Release preparation

Keep local validation and publication separate. Retain the completed artifact manifest and hashes, and verify the product identity and source commit before choosing assets for the [DSHU repository](https://github.com/Water-Run/deepseek-harness-uncensored/releases). Signing, real download/install qualification and an eventual publication workflow remain explicit delivery work.

Do not restore the upstream COS jobs to obtain release automation. The [publication policy](../README.md) owns the current destination and migration instructions.
