# Agent Note: First-entry acknowledgement for new Security conversations

Status: implemented

English | [中文](2026-10-24-security-entry-acknowledgement.zh.md)

## Problem

The Security preset had no entry gate. A person could pick it for a new conversation and immediately run commands under the strongest tool composition, while the only responsibility text lived in the mode guide and the protection backend was absent. The requirement asks for one acknowledgement per Host launch, shown only for the first new main conversation that selects Security; established conversations keep their separate temporary switch permission.

The confirmation must read real protection state, not a configuration flag. The deferred target-protection work provides no runtime status today, so the product must report protection as unavailable and must not claim it is enabled. The acknowledgement also must not become a target authorisation or an execution guard.

## Decision

Keep the policy in `@deepseek-ai/dsh-agent-preset-registry` as a second, independent permission beside the existing mode-switch permission:

- `SecurityEntryPermission` owns the Host-lifetime acknowledgement, one pending challenge, the monotonic reading interval, the challenge lifetime, and the Host-issued declaration. It never shares state with the mode-switch permission.
- The registry's `select` refuses a blank new conversation entering the configured Security preset with `security-entry/required` until the acknowledgement exists. Established conversations bypass this check and keep the temporary switch policy.
- `session.create` refuses an explicit Security preset through `assertNewConversationPreset`; a request naming no preset keeps the deployment default. Headless and SDK compositions that do not compose the registry are unchanged.
- The Web profile enables `requireSecurityEntryAcknowledgement` and names `securityEntryPreset`. Other profiles keep the default off.
- A deployment may provide `securityProtection` with `read(): SecurityProtectionStatus`. The provider owns the runtime state and revision and emits `security-protection/changed`; the registry invalidates an open challenge and publishes the new state. Without a provider the state is `unavailable`.
- The dialog displays the challenge's declaration verbatim, waits for the countdown, and validates the same exact declaration on the Host. The client keeps no second copy of the text.
- The client controller gates the seat before staging, so the mode accent, chip, and conversation mode do not move until the Host accepts. Cancelling clears the stage and leaves the draft and mode untouched.

## Alternatives considered

- **Merge with the mode-switch permission.** Rejected: the two confirmations have different scopes (new conversations versus established ones), different state lifetimes, and different UI. Sharing a switch would let one satisfy the other.
- **Treat a configuration `enabled` field as protection.** Rejected: it cannot distinguish a running provider from an archived or broken one. The provider contract reports availability and a revision.
- **Store the acknowledgement in settings.** Rejected: requirement and security boundary both call for Host-lifetime memory only. A page refresh keeps it because the Host keeps it; a Host restart drops it.
- **Validate a client boolean or a non-empty declaration.** Rejected: the Host issues a one-time challenge, binds it to the session and protection revision, and requires the exact text.
- **Gate only the UI.** Rejected: `select` and explicit creation are the backend operations that grant the preset, so the refusal lives there.

## Consequences

- The first new Security conversation after each Host start shows one dialog. Later new conversations in the same launch proceed, and established conversations never see it.
- With no protection provider, the dialog says protection cannot be confirmed and requires the declaration. This is the shipped Web state until the deferred execution protection returns.
- The acknowledgement records the operator's declaration; it does not enforce target rules and cannot prove authorisation for a third-party target.
- A provider that changes state during the countdown invalidates the challenge; the client re-reads and starts a new reading interval.
