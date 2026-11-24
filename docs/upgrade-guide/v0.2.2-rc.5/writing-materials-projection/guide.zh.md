---
kind: upgrade-guide
description: "自定义写作资料配置需要会话投影服务。"
---

# 写作资料需要会话投影

[English](guide.md) | 中文

## 变更

写作资料服务通过私有会话投影记录对话是否载入过选中资料。对话压缩或重新打开后，清空选择仍会记录撤销通知。挂载 `@deepseek-ai/dsh-api-mode-dossiers` 的自定义 Cordis 配置需要提供会话投影服务。

## 迁移

在 Session 存储所在的 Host 作用域挂载 `@deepseek-ai/dsh-session-projection`。内置 Web 配置已经提供该服务。打开写作对话，选中一份资料并发送消息。压缩对话后清空选择，再发送一条消息，请求历史应出现一次撤销通知。
