---
kind: upgrade-guide
description: "Messages search requires a plain HTTP(S) base URL before resolving credentials."
---

# Messages search base URLs

English | [中文](guide.zh.md)

## Change

Messages search resolves `/messages` as a path segment. Earlier builds appended the suffix to the configured string, which could put it after a query or fragment. The provider now requires an HTTP(S) base URL with a host and optional path. It rejects credentials, queries and fragments before resolving the search credential.

## Migration

1. In the Web search and fetch plugin settings, update the Messages search Base URL to the gateway's HTTP(S) prefix, such as `https://gateway.example/anthropic/v1`. For deployment files, update `web-search-deepseek.baseURL` or `DEEPSEEK_SEARCH_BASE_URL` where the endpoint is defined.
2. Keep the key in the configured credential reference. Confirm that the provider is available and a test search succeeds through the expected gateway. [Messages search settings](../../../../packages/web/web-search-deepseek/README.md)
