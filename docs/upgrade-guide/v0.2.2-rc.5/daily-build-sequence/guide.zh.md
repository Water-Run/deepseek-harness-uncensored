---
kind: upgrade-guide
description: "每天的第一个日期构建改用序号 0，而不再是 1。"
---

# 日期构建序号

[English](guide.md) | 中文

## 变更

DSHU 的日期版本在界面中为 `YYYY.MM.DD.N`，在包声明中为 `YYYY.MMDD.N`。此前的构建从 `1` 开始编号，并把 `0` 视为无效序号。现在序号从 `0` 开始，因此每天的第一个构建是 `2026.11.25.0`。已有的日期版本仍然有效且可比：`N` 依然在当天内递增，日期之间仍按数字排序。

## 迁移

1. 省略 `--build-version` 或传入 `auto` 打包时，当天没有留存产物或交付记录就从 `0` 开始编号；已留存 `.0` 交付时接续为 `.1`。清理构建缓存前保留交付记录，编号才能接续。
2. CI 的 `build-number` 模式接受 `PACKAGE_BUILD_SEQUENCE=0`，表示当天的第一次尝试。每次尝试仍需分配互不相同的序号。
3. 自行解析序号的工具必须接受 `0`。`@deepseek-ai/dsh-product-version` 中的 `parseCalendarVersion()` 与 `calendarBuildVersion()` 已经支持，通过 `YYYY.MMDD.N` 运行时形式进行的比较仍按数字排序。
