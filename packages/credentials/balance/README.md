---
description: "读取账号或 API Key 的余额，并在本机保留按账号隔离的采样记录。"
kind: "package-reference"
---

# 内置余额服务

## Summary

提供赠金、充值余额和本机历史记录。登录账号优先，否则使用配置的 API Key；凭据不会返回给界面。

## 使用

随 Web 和 Desktop 默认加载。可设置显示开关、15–3600 秒刷新间隔，以及本机记录或 API 实时采样。公共余额 API 只提供当前余额，曲线从本机开始采样后累积。

## Model Experience

不添加模型工具或提示词，不改变对话内容或 KV 缓存。查询余额不启动模型请求。

## Known Limitations and Deferred Work

本机历史不能回溯首次采样前的数据。API Key 更换后使用独立历史；重新使用原 Key 可读取它原有的记录。
