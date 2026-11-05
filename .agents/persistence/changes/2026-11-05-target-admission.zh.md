---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-05-target-admission

[English](2026-11-05-target-admission.md) | 中文

## 概述

新增仅写日志的 target/admission，将可选审计库的判定投影到发起会话，并在可用时保留其父会话。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-05-target-admission
baseline: false
changes:
  - root: "event:target/admission"
    previous: null
    after: "3e58f5a3c83c1afd5cedd11cb7851c7853e7d2c428f347f1002e7b05b12711a8"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有 Session 事件保持有效，写入格式仍为 4。旧读取器在回放前拒绝不认识的必需事件 target/admission，不会静默丢弃证据。当前读取器保留事件而不将其加入模型对话表面。已提交的会话代际均不改写。独立审计数据库在事务中从版本 1 升级到 2，保留所有记录及指纹密钥。没有来源信息的旧审计记录仍然有效。旧审计实现会在打开时拒绝版本 2，降级须恢复升级前备份。

<a id="verification"></a>
## 验证

审计、并发 AgentLoop 归属、所有者设置、客户端审计和 TypeScript SDK 投影共 15 项通过。主线、旁问、随问和子任务在真实 JSONL 刷盘读取与审计库重启后仍各自保留记录。明确的工具调用方优先于继承归属，独立工具调用清除继承归属。会话追加失败会拦截新的放行操作；撤下时先记录挂起检查再关闭存储。Python SDK 投影 4 项通过。版本 1 审计库升级保留记录和目标指纹。另有 82 项 Session 兼容测试、SSH 无密钥回放和 390 像素 Web 归属流程通过。

<a id="dev-note"></a>
## 开发备注

无。
