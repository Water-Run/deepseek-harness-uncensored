---
description: "Persist owner-selected target rules and apply them at a guarded HTTP connection point."
kind: "package-reference"
---

# @deepseek-ai/dsh-target-protection

English | [中文](README.zh.md)

## Summary

This optional backend stores production and test targets and can deny an HTTP connection before the destination receives it. It binds DNS names to the actual connection addresses and supports local country data. Production restrictions win over test exceptions. Invalid stores and missing evidence never become default permission. The default product has not enabled this integration; other execution adapters and management UI remain unfinished.

## Table of Contents

- [Use this package](#use-this-package)
- [Implementation](#implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Mount the root service with an explicit `path` to a dedicated SQLite registry. Mount `./http` instead of the ordinary HTTP fetch provider, alongside the web service. Both providers use the same ID and cannot coexist. The guarded consumer requires `targetProtection`; removing that service withdraws the consumer rather than restoring unrestricted fetches.

`busyTimeoutMs` bounds SQLite lock waits (default 1000); `checkTimeoutMs` bounds address checks (default 5000); `maxRechecks` bounds retries after concurrent configuration changes (default 3). These options do not authorize replay of a network operation.

`dnsServers` defaults to the OS resolver list; `hostsFile` defaults to the system hosts file. `dnsQueryTimeoutMs` defaults to 1500, `dnsMaxCnameDepth` to 8, `dnsMaxRecords` to 256 and `hostsMaxBytes` to 1 MiB. DNS uses these configured resolvers rather than choosing an external public resolver. Refusals and invalid replies are not evaded by asking another server.

Rules support exact hosts, domain suffixes, linear-time regular expressions and IP networks, with optional port and database identifiers. Test exceptions require an exact host or IP. Full production protection denies access. Audit protection accepts only effects guaranteed read-only by an executor; HTTP GET alone does not establish that guarantee. An exception for one IP cannot exempt another possible connection address in the same DNS answer set.

The registry defaults mainland protection to enabled. Mount `./country` to use the pinned DB-IP Lite dataset. Its `path` defaults to the bundled file, `maxBytes` to 32 MiB and `maxAgeDays` to 45. Missing, damaged, future or expired data cannot establish an outside destination. The `.cn` and Chinese China domain labels are separate evidence. Unresolved names or regions are refused unless an exact test exception applies. No UI reports this partial backend as complete protection.

Country data is an estimate with limited coverage and accuracy. [IP Geolocation by DB-IP](https://db-ip.com) is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see [the bundled notice](assets/NOTICE.md). A web composition using these results must display that linked attribution. Data updates currently require replacing the configured local source and reloading its provider; the product settings integration is unfinished.

<a id="implementation"></a>
## Implementation

<details>
<summary>Maintainer details</summary>

The SQLite format has monotonic `SCHEMA_VERSION = 1` and application ID `DSTP`. It initializes only an empty database, rejects unrelated applications and future versions, and preserves corrupt data for diagnosis. Writes compare the caller's expected revision inside a transaction. Reads observe current committed state across connections.

The HTTP consumer checks before resolution and before each connection, including redirects. The resolver retains CNAMEs and A/AAAA records from the same answer packets, validates transaction/question identity, follows bounded chains and uses TCP for truncated UDP replies. Hosts-file aliases and localhost are handled without external lookup. The shared transport pins the validated addresses and retains NAT64 IPv4 aliases for rule and country checks. Unrelated answer records never become destinations.

The decision uses current rules and rechecks their revision after asynchronous resolution. Local rule changes and country-provider replacement cancel requests using the old generation; this does not roll back effects already sent. Proxy-resolved addresses remain explicitly unknown. Registry failure, cancellation and service disposal cannot authorize a connection.

The independent registry does not change Session record types. Durable execution-audit events and SDK projections belong to the remaining audit integration. The archived development draft is not a supported database predecessor and is never silently imported.

</details>

<a id="model-experience"></a>
## Model Experience

This package adds no model request or tool definitions. Existing fetch calls can return a typed target-policy error. Effects come from the executing adapter, never from a model's claim that a command is safe.

#### KV Cache effect

No new prompt prefix is added. A refusal changes only the affected tool result.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

This backend currently covers only the explicitly composed guarded HTTP provider. It is not a process sandbox and does not yet enforce shell, PTY, SSH, filesystem, database protocol, browser, MCP/REA or security-proxy operations. Unknown proxy destinations are refused; proxy-side address binding is unfinished. DNS proof describes the configured resolver's answer, not every hostname that may share an IP, and country data does not prove physical location or ownership. Production read-only audit needs structured executing adapters. Default product composition, owner UI, security-entry status and durable audit remain unfinished.

<a id="dev-note"></a>
## Dev Note

Tests include real local listeners, cross-connection SQLite conflicts, reopen/corruption checks, and a real Loader configuration with mandatory-provider withdrawal. RE2JS handles regex matching; ipaddr.js handles canonical IP networks. The implementation plan and remaining acceptance cases are recorded in [the target protection plan](../../../.agents/requirements/2026-10-26-target-protection.md).
