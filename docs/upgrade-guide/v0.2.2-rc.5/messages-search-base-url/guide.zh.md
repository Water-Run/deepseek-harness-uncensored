---
kind: upgrade-guide
description: "Messages 搜索在读取凭据前要求使用只含主机和可选路径的 HTTP(S) 基址。"
---

# Messages 搜索基址

[English](guide.md) | 中文

## 变更

Messages 搜索将 `/messages` 作为路径段追加。旧版直接拼接配置字符串，后缀可能落入查询串或片段。提供方现在要求使用带主机和可选路径的 HTTP(S) 基址，在读取搜索凭据前拒绝基址中的凭据、查询串和片段。

## 迁移

1. 在「网页搜索与抓取」插件设置中，将 Messages 搜索基址改为网关的 HTTP(S) 前缀，例如 `https://gateway.example/anthropic/v1`。部署配置中的端点通过 `web-search-deepseek.baseURL` 或 `DEEPSEEK_SEARCH_BASE_URL` 修改。
2. 密钥保留在已配置的凭据引用中。确认提供方可用，并通过预期网关执行一次测试搜索。[Messages 搜索设置](../../../../packages/web/web-search-deepseek/README.zh.md)
