---
kind: upgrade-guide
description: "The first calendar build of each day now uses sequence 0 instead of 1."
---

# Daily build sequence

English | [中文](guide.zh.md)

## Change

DSHU calendar versions are `YYYY.MM.DD.N` for display and `YYYY.MMDD.N` in manifests. Earlier builds numbered a day from `1` and rejected `0` as an invalid sequence. The sequence now starts at `0`, so the first build of a day is `2026.11.25.0`. Every existing calendar version stays valid and comparable: `N` still increases within its day, and days still order numerically.

## Migration

1. Packaging without `--build-version`, or with `auto`, numbers a day from `0` when that day retains no artifacts or deliveries; a retained `.0` delivery continues at `.1`. Keep delivery records so numbering resumes after build caches are cleared.
2. CI `build-number` mode accepts `PACKAGE_BUILD_SEQUENCE=0` for the day's first attempt. Allocate one distinct sequence per attempt as before.
3. Tooling that parses the sequence itself must accept `0`. The shared `parseCalendarVersion()` and `calendarBuildVersion()` in `@deepseek-ai/dsh-product-version` already do, and comparisons through the `YYYY.MMDD.N` runtime form stay numeric.
