---
kind: upgrade-guide
description: "New named-child and Team records can be refused by older DSHU readers."
---

# DSHU rc.2 Session records

English | [中文](guide.zh.md)

## Change

The rc.2 intake keeps Session format 4 and reads existing logs. New child catalogs use payload version 3, Team selections use `team/mode`, and task records may carry `ownerName`. Readers predating these records can refuse an unknown catalog version, required event or task field; keeping the same Session-format number does not promise downgrade support. Retry and settlement source metadata also flow through DSHU prediction and memory audits. The [local acknowledgement](../../../../.agents/persistence/changes/2026-11-12-rc2-intake.md) records the combined fork types separately from upstream reference history.

## Migration

1. Exit DSHU and retain a pre-upgrade copy of its data directory, normally `~/.dsh-uncensored`, or the directory selected through `DSH_UNCENSORED_HOME`.
2. Use the matching DSHU Windows or Linux build and SDKs. Open existing conversations before creating new named children or Team records; historical records need no rewriting or field backfill.
3. If an older build rejects new records after a downgrade, exit it and restore the pre-upgrade backup. Do not delete unknown events or manually edit Session versions to bypass admission.
