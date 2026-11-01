---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-01-alpha2-message-attribution

English | [中文](2026-11-01-alpha2-message-attribution.zh.md)

## Summary

The 0.2.2-alpha.2 integration expands message-source attribution in six existing event roots: agent/inbox/spliced, developer/message, user/message, input/prediction, memory/extraction and session/title-llm-request. User principals add the share-viewer alternative; skill-catalog adds optional incomplete; action-cards adds an attribution-only source kind.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-01-alpha2-message-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-26-memory-extraction"
    after: "a8ad18683a1130d395ea612ef071edf01cadc904181a52b7cf5290e6b6a30975"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-26-memory-extraction"
    after: "f6c76138373384c2104c184a974c1bb8fcbe11ad11dea1bae1cf774e1d3e9cbc"
    decision: same-version
  - root: "event:input/prediction"
    previous: "2026-10-26-memory-extraction"
    after: "881adc67c8624acedd45ee45ab20c21ffc1d181e244a829ad987fe77ff6b4e05"
    decision: same-version
  - root: "event:memory/extraction"
    previous: "2026-10-26-memory-extraction"
    after: "661fdd969dd4a09f26d956e7a0b3c0adce7e2a09cb5f4284b4367a4407411bab"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-26-memory-extraction"
    after: "0c3cb055d6a06e854a570025d1621d959f7bb154858af1e13ac35c07f8ffc54d"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-26-memory-extraction"
    after: "c334cbc2ab6e49467421412cf9d4ae6bfc1cb898ed8ca539f94d828d126f0ad2"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Keep Session format V4. The existing owner principal is an unchanged union alternative, and the new attribution fields do not change message roles or execution meaning. Current readers retain producer-owned source metadata. LiveShare authorization derives from the authenticated live peer, never from a principal copied out of a Session log. Existing title-request message variants and memory/prediction request envelopes remain readable. Historical schemas, finalized records and committed predecessor Session generations are not rewritten; this decision makes no downgrade promise.

<a id="verification"></a>
## Verification

Schema comparison identified exactly six changed roots and verified the old owner-principal digest as an unchanged alternative of the expanded union. Focused source-admission, LiveShare principal/routing, execution and proxy-gate tests passed (112 cases). The repository corpus separately inventories two malformed authored V3 protection inputs by exact hash and refusal; their selected V4 successors remain readable. Full migration acceptance and packaging are tracked separately in the development handoff.

<a id="dev-note"></a>
## Dev Note

None.
