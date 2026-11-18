---
kind: upgrade-guide
description: "Messages 搜索只在模型端点的同一源站复用模型密钥引用。"
---

# Messages 搜索凭据的源站校验

[English](guide.md) | 中文

## 变更

此前，Messages 搜索会向搜索端点发送配置的密钥，即使该引用和另一个源站上的模型共用。搜索端点与模型的协议、主机或端口不一致时，现在会在读取共用密钥前结束请求。使用自定义 DeepSeek API Key 模型路由时，未单独配置搜索端点且使用默认搜索密钥引用的请求会继承模型端点及其凭据引用。

## 迁移

1. 如需通过模型网关搜索，可保持搜索端点未设置，或将 `web-search-deepseek.baseURL` 设为同源的 Messages 基址。确认请求返回网关提供的搜索结果。
2. 如需使用不同源站，将 `web-search-deepseek.baseURL` 指向该端点，将 `web-search-deepseek.apiKeyEnv` 设为该端点的专用凭据引用。确认使用专用密钥可以返回搜索结果。
