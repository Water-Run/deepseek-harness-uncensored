---
kind: upgrade-guide
description: "Named target-protection test rules match the requested hostname and owner-configured aliases."
---

# Exact hostname test exceptions

English | [中文](guide.zh.md)

## Change

With optional target protection enabled, earlier hostname test rules could also match inferred names or shared addresses. These rules now match the requested hostname against the exact primary selector and any owner-configured hostname aliases. IP selectors cover their matching pinned addresses. Production rules still evaluate every verified name and address.

## Migration

1. In the [Target protection panel](../../../../packages/client/ui-security-proxy/README.md), open the affected test rule. Add a host selector to `aliases` for each additional hostname you own and intend to test. Set its service port and any database qualifier, then select **Save rules**.
2. Retry a permitted request using the configured hostname. Confirm that production restrictions still take priority and that other hostnames receive the normal regional checks.
