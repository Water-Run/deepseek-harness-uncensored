---
kind: upgrade-guide
description: "Custom writing-material configurations require the Session projection service."
---

# Writing materials require session projections

English | [中文](guide.zh.md)

## Change

The writing-materials service uses a private Session projection to remember that a conversation received selected materials. Clearing a selection after compaction or reopening the conversation therefore records a withdrawal. Custom Cordis configurations that mount `@deepseek-ai/dsh-api-mode-dossiers` need the projection service.

## Migration

Mount `@deepseek-ai/dsh-session-projection` alongside the Session store in the same Host scope. The bundled Web profile already provides it. Open a Writing conversation, select a material, send a message, clear the selection after compaction and send another message. The request history should contain the withdrawal once.
