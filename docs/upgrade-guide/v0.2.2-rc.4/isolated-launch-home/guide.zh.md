---
kind: upgrade-guide
description: "DSHU 启动入口要求资料目录与官方 DeepSeek Harness 分开。"
---

# 使用独立的 DSHU 资料目录

[English](guide.md) | 中文

## 变更

当所选资料目录与官方默认的 `~/.dsh` 重叠时，DSHU 桌面和命令行会拒绝启动。目录链接或 Windows 目录联接造成的重叠也会被拒绝。桌面以启动时的工作目录解析相对的 `DSH_UNCENSORED_HOME`，并将同一绝对路径传给 Host。

## 迁移

1. 将 `DSH_UNCENSORED_HOME` 设为独立的 DSHU 资料目录。如果桌面和终端命令从不同位置启动，请使用绝对路径。
2. 修正指向 `~/.dsh` 或其父目录、子目录的链接。保留官方应用原有的资料。
3. 重新打开 DSHU，确认所选目录中的设置和会话已加载。
