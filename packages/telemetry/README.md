---
description: "Shared telemetry transport plugins for business consumers."
kind: "package-group"
---

# telemetry/ — shared reporting

English | [中文](README.zh.md)

## Summary

This group provides reporting infrastructure shared by product analytics and feedback-authorized Session uploads. Business plugins select events, identities, authorization, and redaction; transport plugins own encoding and delivery.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`otel`](otel/README.md) | Cordis service creating independent ordinary-event and byte-bounded Session-log channels |

<a id="related-documentation"></a>
## Related documentation

- [OTel subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/docs/subsystems/otel.md) — shared service and consumer ownership.

<a id="dev-note"></a>
## Dev Note

None.
