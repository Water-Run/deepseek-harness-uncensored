---
kind: upgrade-guide
description: "桌面更新统一使用安装包指定的 DSHU 发行源。"
---

# DSHU 桌面更新

[English](guide.md) | 中文

## 变更

设置中的正式版和开发版选项已移除。应用菜单的「检查更新」和自动更新均使用 DSHU 安装包的发行源。

## 迁移

升级后无需操作。以前选择开发版的用户自动使用同一发行源，已有桌面设置文件和其他偏好保留原样。接入桌面预加载 API 的客户端应使用 `updates.status()`、`updates.open()` 和 `updates.subscribe()`。
