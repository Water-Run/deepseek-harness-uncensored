---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-24-uncensored-contexts

English | [中文](2026-10-24-uncensored-contexts.zh.md)

## Summary

Records Uncensored's input prediction, spending continuation, memory context, and selected mode materials.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-24-uncensored-contexts
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "61392607f29d51e76029632718131567febbbd8f9ce80283b46c293b585ba577"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "c99abf636caebfda2044a5c1f53aaadbc1e1e08acc4cf215aab5e6167ba6ad69"
    decision: same-version
  - root: "event:input/prediction"
    previous: null
    after: "89d356a2515f5fb8db0dde3c13beba781f21e6a31447860298b2d1a971ccee96"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "78277155037829044e16e05a35ceeaef3e23e545cebaafe63927b9d49106a8c9"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "b3d510527b39cdf8047a19491743226a894031c5ce865d5ff7e5d0096d219ed0"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

SESSION_FORMAT_VERSION remains 4. Existing records keep their fields and discriminators. The four new message sources carry ContextFormed metadata: notice or context form and a bounded summary, so readers can render their role without treating them as human input. memory-context is attribution-only. Spending pauseId and prediction requestId/request/outcome/usage are optional when reading earlier Uncensored records. The new input/prediction event is log-only; it does not change the conversation surface. Frozen historical formats and accepted v4 records remain unchanged. This acknowledgement does not promise downgrade support for older builds that do not recognize a new event. The separate spending SQLite ledger advances monotonically to schema 2 and preserves legacy pauses for manual review.

<a id="verification"></a>
## Verification

The 2026-10-24 integration ran 116 core, 249 client, and 176 delivery-integration tests, plus the complete nine-step build. API prediction audit records match TypeScript and Python SDK fixtures. Actual AgentLoop and JSONL restart tests cover spending continuation, durable notification acknowledgement, failure retry, user stop, and deletion. Memory AgentLoop tests cover injected record IDs and versions, scope selection, and deletion; mode-dossier tests cover selected writing material injection. The internal-layout regression retains frozen schemas and rejects modified finalized records, a second baseline, and missing bilingual records.

<a id="dev-note"></a>
## Dev Note

None.
