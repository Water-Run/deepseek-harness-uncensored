---
kind: upgrade-guide
description: "可选目标保护配置停用内置服务端搜索与抓取提供方。"
---

# 目标保护使用本机校验的抓取

[English](guide.md) | 中文

## 变更

此前，可选的 `target-protection.yml` 配置仍提供内置 Messages 搜索和 DeepSeek 搜索与抓取 API。此配置现在在启动时停用这些提供方，因为远端服务器代为发出的请求无法逐个按本机规则校验目标。受控的 `http` 提供方继续抓取网址，并检查每次连接和重定向。

## 迁移

1. 如果你复制过示例，请从[当前目标保护配置](../../../../apps/cli/config/examples/target-protection.yml)同步 `web`、`web-search-deepseek` 和 `web-deepseek-api` 三项。
2. 在网页搜索与抓取设置中，清除已保存的 DeepSeek 抓取 API 选项，或选择本机 HTTP 提供方。确认 `web_fetch` 能打开已知且获准的网址，并且提供方菜单中已移除这两个内置搜索选项。
