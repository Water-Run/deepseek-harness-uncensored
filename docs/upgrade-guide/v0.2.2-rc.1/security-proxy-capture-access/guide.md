---
kind: upgrade-guide
description: "Reading captured security proxy exchanges requires the application owner."
---

# Captured security proxy exchanges require owner access

English | [中文](guide.zh.md)

## Change

Delegated Remote peers could call `securityProxy/list` and `securityProxy/detail` to read captured exchanges. Both methods now require the application owner. Delegated peers can still read proxy status through `securityProxy/get`. Captured URLs mask recognized secret query fields before storage.

## Migration

1. Use `securityProxy/get` in delegated clients that display connection status. Read captured exchanges through `securityProxy/list` and `securityProxy/detail` from the application owner's connection.
2. Confirm that a delegated call to either capture method returns `security-proxy/owner-required`, and that the owner can still open the captured exchange.
3. Match captured URLs by path and non-secret fields. Confirm the original request still reaches its target and the capture masks known secret values.
