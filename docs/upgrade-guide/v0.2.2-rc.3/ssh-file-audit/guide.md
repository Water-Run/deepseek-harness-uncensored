---
kind: upgrade-guide
description: "Guarded SSH file requests can report an unconfirmed audit after their remote effects have completed."
---

# Handle unconfirmed SSH file audits

English | [中文](guide.zh.md)

## Change

With `target-protection` audit storage configured, guarded SSH records file request results and refusals as well as connection admission. A returned helper result whose audit acknowledgement fails raises `TargetAuditError` with `TARGET_AUDIT_UNCONFIRMED`. Remote effects may already have completed. `TARGET_AUDIT_UNAVAILABLE` refuses subsequent file requests before dispatch. A failed admission write still prevents the underlying operation.

Stream results that cannot be delivered close their allocated helper cursor. Unconfirmed cursor cleanup keeps the unconfirmed error and its diagnostic cause. Cancellation and transport failures do not establish rollback. The helper protocol, protection defaults and audit record fields are unchanged.

## Migration

1. Keep the configured `auditPath` writable by the Host and separate from the rule registry. Restore audit storage and restart the affected provider after an audit failure.
2. Consumers must handle `TARGET_AUDIT_UNCONFIRMED` by inspecting the remote file state before retrying. Do not automatically replay a mutation or continue an affected stream. `TARGET_AUDIT_UNAVAILABLE` means that request did not start.
3. Verify the integration with a disposable target: a denied write leaves it unchanged, a successful write has a file audit, and an injected final audit failure reports uncertainty while preserving the actual file state. See the [execution checks](../../../../packages/guard/target-protection/tests/remote-audit.spec.ts) and [stream cleanup checks](../../../../packages/ssh/ssh/tests/direct/audit.spec.ts).

File identities are keyed fingerprints of the authenticated endpoint and requested paths. These records do not attest the helper's matched central resource UUIDs. No key, raw path or file content is added to the audit record.
