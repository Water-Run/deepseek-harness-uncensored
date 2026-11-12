---
kind: upgrade-guide
description: "DSHU 额度准入和输入预测失败改用 HarnessError，不再使用 LlmError。"
---

# 处理 DSHU 本机准入错误

[English](guide.md) | 中文

## 变更

DSHU 额度准入和输入预测对本机失败抛出 `HarnessError`。此前使用 `LlmError`，而其构造器现在只接受内建模型失败码。`SPEND_REQUEST_TOO_LARGE`、`SPEND_RATE_UNKNOWN`、`PREDICTION_OUTPUT_LIMIT` 和 `PREDICTION_INCOMPLETE` 保持不变。这些失败不表示服务商拒绝请求，也不授权重试服务商请求。

## 迁移

1. 处理这些本机失败的插件从 `@deepseek-ai/dsh-llm` 导入 `HarnessError`，同时判断 `error instanceof HarnessError` 和具体的 `error.code`，替换对 `LlmError` 或其名称的判断。
2. 保留既有恢复动作：调整额度配置，或丢弃失败的预测。额度拒绝时不能发送模型请求，失败的预测不能进入对话。
3. 验证被额度拒绝的记忆提炼报告 `budget` 失败，且不发送额外模型请求。已有 Session 日志无需改写。
