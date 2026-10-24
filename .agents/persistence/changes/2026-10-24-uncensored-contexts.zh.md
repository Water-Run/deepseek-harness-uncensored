---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-24-uncensored-contexts

[English](2026-10-24-uncensored-contexts.md) | 中文

## 概述

记录 Uncensored 的输入建议、额度续跑、记忆上下文与选中的模式资料。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-24-uncensored-contexts
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "61392607f29d51e76029632718131567febbbd8f9ce80283b46c293b585ba577"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "c99abf636caebfda2044a5c1f53aaadbc1e1e08acc4cf215aab5e6167ba6ad69"
    decision: same-version
  - root: "event:input/prediction"
    previous: null
    after: "89d356a2515f5fb8db0dde3c13beba781f21e6a31447860298b2d1a971ccee96"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "78277155037829044e16e05a35ceeaef3e23e545cebaafe63927b9d49106a8c9"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "b3d510527b39cdf8047a19491743226a894031c5ce865d5ff7e5d0096d219ed0"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

SESSION_FORMAT_VERSION 保持 4。既有记录的字段和判别标记不变。四种新增消息来源带有 ContextFormed 元数据：notice 或 context 形式及有长度上限的摘要，读取方可按消息作用呈现而不误认为真人输入；memory-context 仅用于归属。读取较早的 Uncensored 记录时，续跑的 pauseId 和预测的 requestId/request/outcome/usage 均为可选。新增 input/prediction 是日志事件，不改变对话呈现。冻结的历史格式和已确认的 v4 记录保持不变。本声明不承诺不识别新事件的旧构建可以降级读取。独立的额度 SQLite 账本单调升级到 schema 2，旧暂停记录保留供手动核对。

<a id="verification"></a>
## 验证

2026-10-24 整合运行了核心 116 项、客户端 249 项、交付接缝 176 项测试及完整 9 项构建。API 预测审计记录与 TypeScript、Python SDK 期望输出一致。真实 AgentLoop 与 JSONL 重启测试覆盖额度续跑、通知持久化确认、失败重试、用户停止及删除。记忆 AgentLoop 测试覆盖注入记录 ID/版本、范围选择和删除；模式资料测试覆盖选中的写作资料注入。内部记录布局回归保留冻结 schema，并拒绝修改已确认记录、重建基线和缺失双语记录。

<a id="dev-note"></a>
## 开发备注

无。
