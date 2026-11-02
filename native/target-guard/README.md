# DSHU native target guard

English | [中文](README.zh.md)

Development component for container-scoped Windows inbound filtering. It is not packaged, elevated automatically, or enabled in the default product. Successful privileged filtering, protected deployment and orphan-rule recovery remain unverified or unfinished.

## Ownership

The private inherited-pipe entry verifies the caller PID and exact creation FILETIME against both pipe creators. Admission verifies the target's creation time, account and AppContainer SID, then duplicates the caller's Job handle with the same access. The caller must already hold query and termination rights. The Job must contain only the trusted bootstrap, prohibit breakaway and use kill-on-close.

The helper creates a unique WFP provider and sublayer plus IPv4/IPv6 ALE receive/accept block filters for that container SID. These objects are persistent: helper failure must not remove protection while a target remains alive. Each provider records its owner and target identities for subsequent recovery work. The helper accepts no commands, arbitrary paths or caller-selected filter rules.

Normal cleanup first observes zero Job members, then removes only its own WFP objects in a transaction. EOF, malformed IPC, lost replies and explicit stop terminate the owned Job before cleanup. Unknown termination or removal outcomes report failure and may retain rules. Recovery after an abnormal helper exit is not implemented; privileged deployment is therefore not ready.

The TypeScript client bounds messages, diagnostics, request waits and helper exit. The private native broker optionally installs this guard before releasing its bootstrap barrier and stops execution if the established guard fails. No user setting or default profile activates this path. The owner must supply a trusted helper outside target-writable paths.

## Development checks

On Windows, from the repository root, with Rust 1.98.1 installed:

```powershell
$env:CARGO_TARGET_DIR = "$PWD/.dsh-build/target-guard"
cargo +1.98.1 build --locked --manifest-path native/target-guard/Cargo.toml
cargo +1.98.1 test --locked --manifest-path native/target-guard/Cargo.toml
$env:DSH_NATIVE_INGRESS_HELPER = "$env:CARGO_TARGET_DIR/debug/dshu-target-guard.exe"
pnpm exec vitest run packages/guard/target-protection/tests/native-ingress-runtime.spec.ts
```

The native acceptance above is for a non-elevated account: it checks caller-identity refusal, unavailable WFP permission and no target dispatch. The broker's complete negative path is covered by `native-policy-runtime.spec.ts` with the same helper variable. An elevated run must not be substituted for these permission-denial cases. Portable Rust tests verify shutdown order and protocol failures; TypeScript tests verify the client and broker barrier. These checks do not establish successful native traffic filtering.

The executable uses inherited private stdin/stdout only. It does not launch UAC, install services or modify BFE permissions. Production elevation, authenticated cross-integrity transport, installation, recovery and administrative acceptance are tracked in [the ingress work list](../../.agents/requirements/2026-11-03-native-ingress.md).

## License

DSHU code is GPL-3.0-or-later. The locked Rust dependencies retain their own licenses: serde/serde_json and windows-sys use MIT or Apache-2.0; their transitive versions are recorded in `Cargo.lock`. This component is not part of a published installer.
