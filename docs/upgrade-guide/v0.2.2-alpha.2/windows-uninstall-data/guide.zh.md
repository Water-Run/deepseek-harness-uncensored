---
kind: upgrade-guide
description: "Windows 卸载默认保留 Electron 用户资料，显式指定时才清理。"
---

# Windows 卸载保留用户资料

[English](guide.md) | 中文

## 变更

Windows 卸载默认保留 Electron 用户资料和更新缓存。依赖静默卸载清理这些数据的脚本需要显式请求清理。两个 Harness 主目录均受保护。

## 迁移

1. 常规卸载或重装时，使用 `/S`。如果调用的是旧卸载器，追加 `/KEEP_APP_DATA`。
2. 确认需要清理 Electron 用户资料和更新缓存时，对新卸载器传入 `/S /DELETE_APP_DATA=1`。核对程序目录已移除，两个 Harness 主目录仍然保留。
