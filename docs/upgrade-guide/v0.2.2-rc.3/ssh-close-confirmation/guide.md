---
kind: upgrade-guide
description: "Direct SSH clients require helpers that negotiate and acknowledge completed shutdown."
---

# Confirmed SSH shutdown

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-ssh/direct` and `@deepseek-ai/dsh-target-protection/ssh` require `closeConfirmation: true` in their helper handshake. The matching helper acknowledges close with `{ quiescent: true }` only after accepted filesystem I/O, processes and cleanup settle. New clients reject older helpers before publishing readiness. A client using the matching protocol version may omit this field and receives `null` on close. The default OpenSSH client does not require this negotiation.

An activated direct connection whose shutdown is unconfirmed rejects disposal with `SSH_REMOTE_CLEANUP_UNCONFIRMED` and retains execution dependencies. Protected connections retain their rule revision: owner settings changes await confirmed shutdown before committing, and a failed shutdown disables new native execution. A TCP disconnect never confirms remote termination. No operation is automatically reconnected or replayed.

## Migration

1. Stop existing remote work, then deploy the matching [SSH helper runtime](../../../../packages/ssh/ssh-helper-runtime/README.md) before upgrading direct clients. Keep it outside Agent-writable paths.
2. Calculate the installed helper entry's SHA-256 and update `helperHash` in the connection's `cordis.yml` or profile patch. Retain the independently verified `hostKeySha256` and existing credential references.
3. Upgrade the client and confirm the connection reaches readiness. On graceful close, confirm disposal succeeds. For protected connections, confirm a rule change finishes only after the connection closes.
4. If `SSH_REMOTE_CLEANUP_UNCONFIRMED` occurs, inspect and stop the owned remote processes and pending file operations through a trusted administrative connection before restarting or reloading the Host. Review uncertain mutations before retrying; do not use a restart as proof of remote cleanup.
