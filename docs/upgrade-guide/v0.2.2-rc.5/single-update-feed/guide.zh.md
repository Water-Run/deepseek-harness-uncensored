---
kind: upgrade-guide
description: "桌面更新统一使用安装包指定的 DSHU 发行源。"
---

# DSHU 桌面更新

[English](guide.md) | 中文

## 变更

设置中的正式版和开发版选项已移除。应用菜单的「检查更新」和自动更新均使用 DSHU 安装包的发行源。

## 迁移

当五个安装包的发行版成为 GitHub Latest 时，`2026.11.23.0` 用户需要下载对应平台的安装包，手动覆盖安装一次。`2026.11.24.3` 可以通过应用菜单中的「检查更新」找到对应安装包。安装后在「关于」核对 DSHU 版本。桌面端会保留已有设置文件。接入桌面预加载 API 的客户端可使用 `updates.status()`、`updates.open()` 和 `updates.subscribe()`。
