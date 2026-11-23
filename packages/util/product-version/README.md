---
kind: package-library
description: "Parse calendar product versions and map them to an ordered package-manager representation."
---

# Product calendar versions

English | [中文](README.zh.md)

## Summary

DSHU displays `YYYY.MM.DD.N`; the first build of each day uses `N` = `0`, so `2026.11.14.10` follows `2026.11.14.9`. The updater and package manifests carry `YYYY.MMDD.N` so existing SemVer engines compare dates and sequences numerically. Windows file resources and product displays use the four-field date.

## Use this package

`parseCalendarVersion()` validates both representations and returns their date, sequence and formatted values. Years range from 2000 to 9999; valid calendar days and sequences from 0 to 65535 keep Windows version fields representable. `calendarBuildVersion()` accepts an explicit `YYYYMMDD` day and sequence. These functions do not read a clock or allocate build numbers.

`displayProductVersion()` and `runtimeProductVersion()` preserve legacy strings. Callers that accept legacy versions must validate them with their existing version parser. Packaging scripts can import `@deepseek-ai/dsh-product-version/bootstrap` before artifacts exist; runtime consumers use the package entry point.

## Dev Note

The date mapping preserves comparison across daily revisions, months and years. Tests cover leap dates, invalid components, legacy values and ordered upgrades. The DSH engine and REA keep their own upstream versions.
