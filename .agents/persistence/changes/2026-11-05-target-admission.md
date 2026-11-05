---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-05-target-admission

English | [中文](2026-11-05-target-admission.zh.md)

## Summary

Adds target/admission as a log-only projection of the optional target audit store, including the initiating Session and its recorded parent when available.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-05-target-admission
baseline: false
changes:
  - root: "event:target/admission"
    previous: null
    after: "3e58f5a3c83c1afd5cedd11cb7851c7853e7d2c428f347f1002e7b05b12711a8"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing Session events remain valid and the writer stays at version 4. Earlier readers refuse the unknown required target/admission discriminator before replay rather than discarding the evidence. Current readers preserve the event outside the model conversation surface. No committed Session generation is rewritten. The separate audit database upgrades version 1 to 2 transactionally, preserving all rows and the fingerprint key. Existing audit rows without source attribution remain valid. Older audit-store implementations refuse version 2 at open; restoring a pre-upgrade backup is required for downgrade.

<a id="verification"></a>
## Verification

The audit, concurrent AgentLoop attribution, owner settings, client audit viewer and TypeScript SDK projection tests passed 15 cases. Main, side, btw and subagent drivers retain separate events through actual JSONL flush/read and audit-store restart. Explicit tool callers supersede inherited attribution; standalone tool calls clear it. Session append failure blocks new admitted work, and withdrawal records the pending check before closing storage. The Python SDK projection suite passed four cases. The version-one audit-store upgrade preserves entries and fingerprints. Another 82 Session compatibility tests, the keyless SSH replay and the 390-pixel Web attribution flow passed.

<a id="dev-note"></a>
## Dev Note

None.
