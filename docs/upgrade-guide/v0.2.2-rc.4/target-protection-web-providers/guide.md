---
kind: upgrade-guide
description: "The optional target protection overlay disables the bundled server-side search and fetch providers."
---

# Target protection uses locally checked fetches

English | [中文](guide.zh.md)

## Change

The optional `target-protection.yml` overlay used to leave the bundled Messages search provider and DeepSeek Search and Fetch APIs available. The overlay now disables those providers at startup because requests that they delegate to remote servers cannot apply local checks to each destination. The protected `http` provider continues to fetch URLs and check each connection and redirect.

## Migration

1. If you copied the example, bring its `web`, `web-search-deepseek`, and `web-deepseek-api` entries into your copy from the [current target protection overlay](../../../../apps/cli/config/examples/target-protection.yml).
2. In the Web search and fetch settings, clear any saved DeepSeek Fetch API selection or select the local HTTP provider. Confirm that a known permitted URL opens with `web_fetch` and that the two bundled search providers are absent from the provider menu.
