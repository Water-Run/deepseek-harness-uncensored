---
kind: upgrade-guide
description: "桌面更新统一使用安装包指定的 DSHU 发行源。"
---

# DSHU 桌面更新

[English](guide.md) | 中文

## 变更

设置中的正式版和开发版选项已移除。应用菜单的「检查更新」和自动更新均使用 DSHU 安装包的发行源。

## 迁移

过渡版在 GitHub 标为 Latest 期间，旧安装可直接点「检查更新」。如果以前手动选过开发版，先在设置中切回正式版。当后续发行版成为 Latest 时，仍用旧更新器的用户可手动安装一次对应平台的最新安装包。安装后在设置中核对当前版本。过渡版和后续版本会直接查询 GitHub 的最新公开正式版，并保留已有桌面设置文件。接入桌面预加载 API 的客户端应使用 `updates.status()`、`updates.open()` 和 `updates.subscribe()`。
