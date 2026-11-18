---
kind: upgrade-guide
description: "Messages search confines a reused model key reference to the model endpoint origin."
---

# Origin checks for Messages search credentials

English | [中文](guide.zh.md)

## Change

Messages search previously used its configured key reference at the search endpoint even when the same reference was used by a model on a different origin. Search now stops before reading a reused key if the search endpoint uses a different scheme, host, or port. On a custom DeepSeek API-key model route, an unconfigured search endpoint and the default search key reference inherit the model endpoint and its credential reference.

## Migration

1. To search through the model gateway, leave the search endpoint unset or set `web-search-deepseek.baseURL` to a Messages base on the same origin. Confirm that a search returns results from the gateway.
2. To search on a separate origin, set `web-search-deepseek.baseURL` to that endpoint and `web-search-deepseek.apiKeyEnv` to a dedicated credential reference registered for it. Confirm that search returns results with the dedicated key.
