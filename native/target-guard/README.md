# DSHU native target guard

English | [中文](README.zh.md)

Development component for container-scoped Windows inbound filtering and conservative orphan-rule recovery. It is not packaged, elevated automatically, or enabled in the default product. Successful privileged filtering, rule removal and protected deployment remain unverified or unfinished.

## Ownership

The private inherited-pipe entry verifies the caller PID and exact creation FILETIME against both pipe creators and rejects a container caller. Admission verifies the target's creation time, account and AppContainer SID, then duplicates the caller's Job handle with the same access. The caller must already hold query and termination rights. The Job must contain only the trusted bootstrap, prohibit breakaway and use kill-on-close.

The helper creates a unique WFP provider and sublayer plus IPv4/IPv6 ALE receive/accept block filters for that container SID. These objects are persistent: helper failure must not remove protection while a target remains alive. Each provider stores a versioned record of its process identities, boot identity and pre-admission process cohort. The helper accepts no commands, arbitrary paths or caller-selected filter rules.

Normal cleanup first observes zero Job members, then removes only its own WFP objects in a transaction. EOF, malformed IPC, lost replies and explicit stop terminate the owned Job before cleanup. Unknown termination or removal outcomes report failure and may retain rules.

The TypeScript client bounds messages, diagnostics, request waits and helper exit. The private native broker optionally installs this guard before releasing its bootstrap barrier and stops execution if the established guard fails. No user setting or default profile activates this path. The owner must supply a trusted helper outside target-writable paths.

## Recovery

A fresh helper accepts `recover`, optionally limited to an original owner PID and exact FILETIME. It considers only supported records for the authenticated account. An active owner, helper or target prevents removal. Every linked WFP object must still match the recorded container SID, action, conditions and flags.

The cohort is captured while the trusted bootstrap barrier is closed. Kernel process sequence numbers distinguish reused PIDs; every process outside that cohort must be classified, and the process set must remain stable across observation. Matching containers, inaccessible identities or changed snapshots retain the rules. A missing parent PID or Job name alone never establishes termination. A changed boot identity retains the record for explicit maintenance; cross-reboot cleanup remains pending.

Version 2 records carry this evidence. Legacy, malformed and unreadable records are counted separately and never upgraded by guessing. Deletion rechecks each record and its linked objects in its own transaction. Results distinguish removed scopes, retained scopes and unrecognized records. Cancellation or transport failure can follow partial cleanup; the client never silently retries or reports an unknown result as success.

## Development checks

On Windows, from the repository root, with Rust 1.98.1 installed:

```powershell
$env:CARGO_TARGET_DIR = "$PWD/.dsh-build/target-guard"
cargo +1.98.1 build --locked --manifest-path native/target-guard/Cargo.toml
cargo +1.98.1 test --locked --manifest-path native/target-guard/Cargo.toml
$env:DSH_NATIVE_INGRESS_HELPER = "$env:CARGO_TARGET_DIR/debug/dshu-target-guard.exe"
pnpm exec vitest run packages/guard/target-protection/tests/native-ingress-runtime.spec.ts
```

The native acceptance above is for a non-elevated account: it checks caller-identity refusal, unavailable WFP permission, recovery refusal and no target dispatch. The broker's complete negative path is covered by `native-policy-runtime.spec.ts` with the same helper variable. An elevated run must not be substituted for these permission-denial cases. Rust tests verify shutdown, protocol and observation decisions; TypeScript tests verify bounded transport. These checks do not establish successful native traffic filtering.

`node native/target-guard/tests/windows-acceptance.mjs --baseline` runs fresh local TCP/UDP IPv4/IPv6 endpoints without WFP changes. The same fixture without `--baseline` requires an already elevated token and checks filtering, normal cleanup and helper-crash recovery, selecting only this run's owner records. It does not elevate itself or access user profiles. The privileged run remains unverified. Results go to `.dsh-build/guard-admin-results`.

The executable uses inherited private stdin/stdout only. It does not launch UAC, install services or modify BFE permissions. Production elevation, authenticated cross-integrity transport, installation and remaining acceptance are tracked in [the ingress work list](../../.agents/requirements/2026-11-03-native-ingress.md).

## License

DSHU code is GPL-3.0-or-later. The locked Rust dependencies retain their own licenses: serde/serde_json and windows-sys use MIT or Apache-2.0; their transitive versions are recorded in `Cargo.lock`. This component is not part of a published installer.
