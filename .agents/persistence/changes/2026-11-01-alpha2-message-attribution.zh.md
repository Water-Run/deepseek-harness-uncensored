---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-01-alpha2-message-attribution

[English](2026-11-01-alpha2-message-attribution.md) | 中文

## 概述

0.2.2-alpha.2 适配扩展六个既有事件根中的消息来源归属：agent/inbox/spliced、developer/message、user/message、input/prediction、memory/extraction 和 session/title-llm-request。用户主体增加 share-viewer 分支；skill-catalog 增加可选 incomplete；action-cards 增加仅用于归属的来源种类。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-01-alpha2-message-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-26-memory-extraction"
    after: "a8ad18683a1130d395ea612ef071edf01cadc904181a52b7cf5290e6b6a30975"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-26-memory-extraction"
    after: "f6c76138373384c2104c184a974c1bb8fcbe11ad11dea1bae1cf774e1d3e9cbc"
    decision: same-version
  - root: "event:input/prediction"
    previous: "2026-10-26-memory-extraction"
    after: "881adc67c8624acedd45ee45ab20c21ffc1d181e244a829ad987fe77ff6b4e05"
    decision: same-version
  - root: "event:memory/extraction"
    previous: "2026-10-26-memory-extraction"
    after: "661fdd969dd4a09f26d956e7a0b3c0adce7e2a09cb5f4284b4367a4407411bab"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-26-memory-extraction"
    after: "0c3cb055d6a06e854a570025d1621d959f7bb154858af1e13ac35c07f8ffc54d"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-26-memory-extraction"
    after: "c334cbc2ab6e49467421412cf9d4ae6bfc1cb898ed8ca539f94d828d126f0ad2"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

Session 格式保持 V4。既有 owner 主体作为联合类型分支保持不变，新增归属字段不改变消息角色或执行含义。当前读取器保留生产方的来源元数据。LiveShare 授权依据已认证的实时连接主体，不使用从 Session 日志复制的主体授权。既有标题请求消息分支和记忆、输入预测的请求记录仍可读取。历史 schema、已定稿记录及已提交的前代 Session 文件不重写；本次决定不承诺降级读取。

<a id="verification"></a>
## 验证

Schema 比对确认只有六个事件根变化，并核实扩展联合类型完整保留旧 owner 主体的摘要。来源准入、LiveShare 主体与路由、执行和代理门禁的定向测试共 112 项通过。仓库语料另以精确哈希及拒绝原因登记两份格式错误的手工 V3 保护输入，其选定的 V4 后继记录可正常读取。整体迁移验收与打包进度独立记录在开发交接中。

<a id="dev-note"></a>
## 开发备注

无。
