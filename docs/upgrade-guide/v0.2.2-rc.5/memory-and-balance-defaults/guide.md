---
kind: upgrade-guide
description: "Conversation memory requires opt-in and balance sampling defaults to 30-day retention."
---

# Memory and balance preferences

English | [中文](guide.zh.md)

## Change

Conversations now require the memory preference to use saved facts or memory tools. Existing records remain available in the manager. With default sampling settings, saving the next balance sample removes observations older than 30 days. An explicit cleanup preference takes precedence.

## Migration

1. To reuse saved facts, open **Settings → General** and turn on **Cross-conversation memory**. Automatic extraction has its own switch.
2. To keep older balance samples, set the balance plugin’s `autoCleanup` to `off` before starting the upgraded Host. In **Settings → Budget → Sampling settings**, verify the cleanup mode and retention period.
