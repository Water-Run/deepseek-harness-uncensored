---
kind: upgrade-guide
description: "The shipped composition no longer fixes a search provider, so web search in a conversation on a DeepSeek model runs legacy Messages search instead of the DeepSeek Search API."
---

# Search on DeepSeek models defaults to legacy Messages search

English | [中文](guide.zh.md)

## Change

Previously, the shared base composition set `web.searchProvider` to `deepseek-search-api`, so every search was one DeepSeek Search API request. Now the base sets no `searchProvider`, and `dsh-web` selects per model provider route. A search made for a model request on the `deepseek-official` or `deepseek-account` route runs the `deepseek-official` search provider: an auxiliary Messages request to `web-search-deepseek`'s endpoint, which has no per-search charge and is billed as model tokens, and which appends a `web/deepseek-search-llm-request` event to the Session log. A search on any other route, or outside a model request, still runs `deepseek-search-api`.

DSHU uses the model gateway and its key reference for a DeepSeek API-key conversation when the search endpoint is unset and the search key reference has its default value. Other searches use the explicit search endpoint or the official Messages endpoint. A shared API-key reference requires the same origin for model and search. See [origin checks](../messages-search-credential-origin/guide.md).

The Web search provider menu on the Web search and fetch settings page gains **Automatic**, which is the selection when none is stored. A composition or profile that sets `web.searchProvider` itself, and `DSH_WEB_SEARCH_PROVIDER`, see no change. Fetch still defaults to `http`.

## Migration

1. To accept the new default, change nothing. Confirm: the Web search provider menu shows Automatic, and a search in a conversation on a DeepSeek model appends a `web/deepseek-search-llm-request` event.
2. To keep the DeepSeek Search API for every model, select DeepSeek Search API in that menu and save, or set `searchProvider: deepseek-search-api` beside `fetchProvider: http` in the `config` of the `@deepseek-ai/dsh-web` row. Confirm: the menu shows DeepSeek Search API, and a search appends no `web/deepseek-search-llm-request` event.
3. To use Messages search through a gateway, select DeepSeek server-side search in that menu and save the gateway's Anthropic-compatible base, which ends before `/messages`, as its Base URL, or set `web-search-deepseek.baseURL`; then select Automatic again if other models should keep the Search API. Confirm: a search on a DeepSeek model returns results, and its `web/deepseek-search-llm-request` event names the gateway endpoint.
