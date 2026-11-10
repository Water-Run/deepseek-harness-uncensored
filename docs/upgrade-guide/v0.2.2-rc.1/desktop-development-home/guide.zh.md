---
kind: upgrade-guide
description: "Desktop 开发启动器使用 DSH_DESKTOP_DEV_HOME 指定自定义 Harness 主目录。"
---

# Desktop 开发使用独立的 Harness 主目录

[English](guide.md) | 中文

## 变更

原启动器用 `DSH_HOME` 指定开发目录，Desktop 则用 `DSH_UNCENSORED_HOME` 确定实际目录。启动器现在使用 `DSH_DESKTOP_DEV_HOME` 指定自定义开发目录，并向 Desktop 和 Host 传入同一路径。工作区默认目录为 `apps/desktop/.desktop-build/development/home`。

## 迁移

1. 需要自定义目录时，运行 `pnpm run dev:desktop` 或 `pnpm run start:desktop` 前，将 `DSH_DESKTOP_DEV_HOME` 设为预期的开发目录。
2. 在开发窗口开始操作前，核对启动器打印的 `DSH_UNCENSORED_HOME` 路径。
