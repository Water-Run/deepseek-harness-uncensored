---
description: "执行策略、额度限制、网安代理与目标保护的包映射。"
kind: "package-group"
---

# guard/：执行策略

[English](README.md) | 中文

## 概述

`guard/` 组负责工具重复提醒、调用期限、额度限制、网安代理与目标策略执行。各包 README 说明实际覆盖范围和启用方式。目标保护仍是开发中的可选集成，默认产品尚未启用。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

每个包拥有对应的策略或执行能力。

| 包 | 提供什么 |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.zh.md) | 在模型重复完全相同的工具调用时提醒它，使其改变方法或结束任务 |
| [`timeout-policy/`](timeout-policy/README.zh.md) | 为声明了限时的工具调用设置超时，让模型得到清晰错误而不是无限等待 |
| [`spend-limit/`](https://github.com/Water-Run/deepseek-harness-uncensored/blob/main/packages/guard/spend-limit/README.md) | 预留与结算模型费用，暂停并恢复请求（中文说明） |
| [`security-proxy/`](security-proxy/README.zh.md) | 定义网安模式的代理路由与流量采集操作 |
| [`security-proxy-local/`](security-proxy-local/README.zh.md) | 配置本地代理并保存有界流量记录 |
| [`target-protection/`](target-protection/README.zh.md) | 持久保存目标规则并校验 HTTP 连接；其他执行适配器尚未完成 |

-----

<a id="related-documentation"></a>
## 相关文档

先从工具子系统参考了解工具调用流水线，再看重复提醒的配置与策略背后的超时库决策。

- [工具服务](../core/tools/README.zh.md)——工具调用流水线与执行决策。
- [提醒配置](repeat-tool-reminder/src/index.ts)——重复调用提醒支持的字段。
- [超时截止时间库 Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——`timeout-policy` 所执行的时序／终止拆分。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
