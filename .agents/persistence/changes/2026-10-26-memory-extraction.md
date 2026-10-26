---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-26-memory-extraction

English | [中文](2026-10-26-memory-extraction.zh.md)

## Summary

Adds logged auxiliary memory-extraction requests and outcomes, with an attributed memory-extraction message source.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-26-memory-extraction
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-24-uncensored-contexts"
    after: "b3892d9893283eefe9e38931e95a7deb71848a178380e18eeb7c30dd62be83d6"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-24-uncensored-contexts"
    after: "52f53fd45b49ee7f4f1b5f92d4b60cbd62c88879f84b1c3c632a4f60ddc0d18d"
    decision: same-version
  - root: "event:input/prediction"
    previous: "2026-10-24-uncensored-contexts"
    after: "2acbf7462e3c8b960c26628157ab6ad35bac9793474e77ab7b7042f1dc9ff581"
    decision: same-version
  - root: "event:memory/extraction"
    previous: null
    after: "6821ea2be208a3e3fe22ffbf50f80bbf80ae9ddf17c82088b229385214245241"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-24-uncensored-contexts"
    after: "0868dd33babdef14148a492a3fbc45c4f692e7117288a2d6ed4e816e83ca6954"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-24-uncensored-contexts"
    after: "5c2b0ca3720e00b4d5c2441df29a63046ce6dd670ab13945a29271d064b39ee8"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records remain valid. The new source kind is emitted only inside the new memory/extraction audit event, not as a main-conversation user or developer message. Older readers refuse the unknown required event before replay; they cannot silently skip saved-memory and usage evidence. Current readers retain the exact request, outcome and optional usage, and rebuild bounded extraction state. No released Session generation is moved, rewritten or removed; the writer version stays unchanged because the event discriminator supports safe refusal.

<a id="verification"></a>
## Verification

AgentLoop tests cover default-off behavior, extraction, invalid-output retry, disabled-record preservation, cancellation, checkpoint failure, quota admission, scoped retrieval and JSON replay. TypeScript and Python SDK audit projections preserve both records without changing the main response. Tests are recorded in .dsh-build/five-items-20261026/.

<a id="dev-note"></a>
## Dev Note

None.
