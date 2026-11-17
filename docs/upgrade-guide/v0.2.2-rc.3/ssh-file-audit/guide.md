---
kind: upgrade-guide
description: "SSH clients require a protocol 4 helper for matched-resource audit receipts and report unconfirmed audits after completed effects."
---

# Handle unconfirmed SSH file audits

English | [中文](guide.zh.md)

## Change

With `target-protection` audit storage configured, guarded SSH records file request results and refusals as well as connection admission. A returned helper result whose audit acknowledgement fails raises `TargetAuditError` with `TARGET_AUDIT_UNCONFIRMED`. Remote effects may already have completed. `TARGET_AUDIT_UNAVAILABLE` refuses subsequent file requests before dispatch. A failed admission write still prevents the underlying operation.

SSH clients and helpers use protocol 4. Older peers refuse the handshake before publishing readiness. Replies carry the file rules actually matched by that request, including refusals; guarded clients associate their indexes with the retained central resource mapping. An unknown rule index closes the connection with `TARGET_AUDIT_UNCONFIRMED` because remote effects may already have completed.

Stream results that cannot be delivered close their allocated helper cursor. Unconfirmed cursor cleanup keeps the unconfirmed error and its diagnostic cause. Cancellation and transport failures do not establish rollback. Protection defaults and audit record fields are unchanged.

## Migration

1. Stop remote work, deploy the matching [helper runtime](../../../../packages/ssh/ssh-helper-runtime/README.md) outside Agent-writable paths, and update `helperHash` to its SHA-256 in `cordis.yml` or the profile patch. Upgrade the client and confirm readiness; retain the independently verified host key and credentials.
2. Keep the configured `auditPath` writable by the Host and separate from the rule registry. Restore audit storage and restart the affected provider after an audit failure.
3. Consumers must handle `TARGET_AUDIT_UNCONFIRMED` by inspecting the remote file state before retrying. Do not automatically replay a mutation or continue an affected stream. `TARGET_AUDIT_UNAVAILABLE` means that request did not start.
4. Verify with a disposable target: a denied write leaves it unchanged, an allowed audit read records only the matched central resources, and an injected final audit failure reports uncertainty while preserving the actual file state. See the [resource checks](../../../../packages/ssh/ssh/tests/direct/central-file-mapping.spec.ts), [execution checks](../../../../packages/guard/target-protection/tests/remote-audit.spec.ts) and [stream cleanup checks](../../../../packages/ssh/ssh/tests/direct/audit.spec.ts).

File identities are keyed fingerprints of the authenticated endpoint and requested paths. Resource IDs come only from verified helper matches; static path rules have no central UUID. No key, raw path or file content is added to the audit record.
