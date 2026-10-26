---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-26-memory-extraction

[English](2026-10-26-memory-extraction.md) | 中文

## 概述

增加辅助记忆提炼的请求与结果日志，以及带来源标记的 memory-extraction 消息。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-26-memory-extraction
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-24-uncensored-contexts"
    after: "b3892d9893283eefe9e38931e95a7deb71848a178380e18eeb7c30dd62be83d6"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-24-uncensored-contexts"
    after: "52f53fd45b49ee7f4f1b5f92d4b60cbd62c88879f84b1c3c632a4f60ddc0d18d"
    decision: same-version
  - root: "event:input/prediction"
    previous: "2026-10-24-uncensored-contexts"
    after: "2acbf7462e3c8b960c26628157ab6ad35bac9793474e77ab7b7042f1dc9ff581"
    decision: same-version
  - root: "event:memory/extraction"
    previous: null
    after: "6821ea2be208a3e3fe22ffbf50f80bbf80ae9ddf17c82088b229385214245241"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-24-uncensored-contexts"
    after: "0868dd33babdef14148a492a3fbc45c4f692e7117288a2d6ed4e816e83ca6954"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-24-uncensored-contexts"
    after: "5c2b0ca3720e00b4d5c2441df29a63046ce6dd670ab13945a29271d064b39ee8"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录仍然有效。新消息来源只写入新的 memory/extraction 审计事件，不作为主对话的用户或开发者消息。旧读取器在回放前拒绝未知的必读事件，不会静默跳过记忆保存与用量信息。当前读取器保留完整请求、结果和可选用量，并恢复有长度限制的提炼状态。不移动、改写或删除已发布的 Session 代际；事件判别字段能够安全拒绝不支持的日志，因此保持写入版本不变。

<a id="verification"></a>
## 验证

AgentLoop 测试覆盖默认关闭、提炼、无效结果重试、保留禁用记录、取消、检查点失败、额度准入、范围内检索与 JSON 回放。TypeScript 与 Python SDK 的审计投影保留两条记录且不改变主回复。测试日志保存在 .dsh-build/five-items-20261026/。

<a id="dev-note"></a>
## 开发备注

无。
