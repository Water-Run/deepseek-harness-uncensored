---
kind: upgrade-guide
description: "DSHU spending admission and input prediction failures use HarnessError instead of LlmError."
---

# Handle DSHU local admission errors

English | [中文](guide.zh.md)

## Change

DSHU spending admission and input prediction raise `HarnessError` for local failures. They previously raised `LlmError`, whose constructor now accepts only built-in model failure codes. The codes `SPEND_REQUEST_TOO_LARGE`, `SPEND_RATE_UNKNOWN`, `PREDICTION_OUTPUT_LIMIT` and `PREDICTION_INCOMPLETE` remain unchanged. These failures do not indicate a provider rejection or authorize a provider retry.

## Migration

1. In plugins handling these local failures, import `HarnessError` from `@deepseek-ai/dsh-llm` and match `error instanceof HarnessError` together with the specific `error.code`. Replace checks for `LlmError` or its name.
2. Keep the existing recovery action: adjust the spending configuration, or discard the failed suggestion. A spending denial must not send the model request; a failed suggestion must not enter the conversation.
3. Verify that a denied memory-extraction request reports the `budget` failure and sends no auxiliary model request. Existing Session logs need no rewriting.
