---
description: "Persist target rules and enforce guarded HTTP, local file and process operations."
kind: "package-reference"
---

# @deepseek-ai/dsh-target-protection

English | [中文](README.zh.md)

## Summary

This optional backend protects named production targets in HTTP and local file operations. It binds DNS to connection addresses, supports local country data, and allows structured file reads under audit rules. Production restrictions win over test exceptions. Arbitrary processes are refused when their effects cannot be confined. The default product has not enabled this integration; additional adapters and management UI remain unfinished.

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

A resource can bind additional selectors in `aliases`, including network endpoints and local data paths. All selectors share its policy and ID; aliases cannot supply their own test or protection flag. Each selector states its own port and database scope without inheriting another selector's qualifiers. Database file markers also protect SQLite-style `-wal`, `-shm` and `-journal` companions. Owners must explicitly bind the relevant data paths; network addresses do not discover those files automatically.

The guarded HTTP consumer uses local resolution and literal-IP CONNECT when a configured HTTP(S) proxy is selected. Rules run before contacting the proxy; the original Host and TLS name remain intact. The proxy must support IP CONNECT and honor that destination. DNS queries use the configured local resolver, not the HTTP proxy. Failed tunnels never fall back to direct or unverified proxy requests.

Mount `./fs` instead of `fs-sandbox`, with the existing `sandboxPolicy` service. Local `path` rules identify an absolute server directory or database file and cannot include network qualifiers. Windows rules require a drive-qualified local path; remote paths are not converted into local paths. Full protection denies reads and mutations; audit permits structured reads while denying writes and edits. Production paths take precedence over overlapping test paths. Symbolic links are resolved again, direct hard-link identities are compared, and an unattributable hard link outside a protected directory is refused. UNC, device and alternate-stream paths need a separate adapter. Watching is currently refused.

The guarded file provider always protects the registry and its SQLite sidecars. `ownerPaths` adds configuration or credential files whose access is refused; `readOnlyPaths` adds sources that may be read but not changed. The configured hosts file and country database are also protected from changes. Owner configuration uses the rule service independently of Agent file access.

Regular-file deletion and non-overwriting rename use the same mandatory rules, including both rename endpoints and source-version validation. Enable `fileOperations` on `tool-fs` for the optional tools. Full and audit production rules deny both operations, even under full-access permissions. Policy changes are rechecked before the first effect; a committed rename finishes source cleanup while retaining the rule owner. If cleanup fails, `FS_PARTIAL_MUTATION` reports that both names may remain. Directory operations and cross-filesystem moves are unsupported.

Mount `./subprocess` instead of `subprocess-local`. It refuses ordinary processes and PTY allocation while mainland or production rules, or protected owner/data files, are present. A test hostname or full-access permission cannot bound arbitrary code. Only a composition with an in-memory registry, disabled mainland protection, no production rules and no protected local sources can delegate to the original process provider. Activating local policy cancels previously admitted processes. This provider does not provide an OS target sandbox.

The registry defaults mainland protection to enabled. Mount `./country` to use the pinned DB-IP Lite dataset. Its `path` defaults to the bundled file, `maxBytes` to 32 MiB and `maxAgeDays` to 45. Missing, damaged, future or expired data cannot establish an outside destination. The `.cn` and Chinese China domain labels are separate evidence. Unresolved names or regions are refused unless an exact test exception applies. No UI reports this partial backend as complete protection.

Country data is an estimate with limited coverage and accuracy. [IP Geolocation by DB-IP](https://db-ip.com) is distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); see [the bundled notice](assets/NOTICE.md). A web composition using these results must display that linked attribution. Data updates currently require replacing the configured local source and reloading its provider; the product settings integration is unfinished.

Mount `./security-proxy` instead of `security-proxy-local`, with mandatory credentials and target protection. Its controlled client, HTTP relay and connection check authorize the original target before literal-IP CONNECT. Origin Host and TLS identity stay fixed; mismatched relay Host headers are refused. Redirects recheck current rules. Opaque CONNECT is refused because tunneled application targets cannot be verified; an endpoint test label does not remove this limitation. Keep the guarded ordinary HTTP provider mounted too, so disabling the independent proxy does not restore unrestricted fetches.

Mount `./ssh` instead of an ordinary SSH connection, with mandatory `credentials` and `targetProtection`, then use `fs-ssh`. It uses the [explicit direct-SSH configuration](../../ssh/ssh/README.md#direct-connection), validates the original name and DNS aliases, fixes one literal destination, and verifies the server key. Full server protection refuses before TCP; audit admits structured file reads and refuses mutations. Exact private test endpoints may perform bounded file operations without relaxing anonymous HTTP restrictions. File calls resolve both path representations in the remote workspace and refuse escaping links; full-access permissions cannot widen that workspace.

SSH filesystem effects are not assumed to avoid resources on another port. Conflicting database/port qualifiers or active production path rules without remote identity mappings are refused. Arbitrary commands, PTC, terminal streams and unknown protocol calls remain unconfined and are refused under active protection. This does not complete unrestricted execution on test servers. Connections close when local policy is revoked and never reconnect silently. SSH currently uses direct TCP, independently of the security-mode HTTP proxy; remote resource mapping and proxy routing remain unfinished.

Mount `./rea` instead of the ordinary REA root service, keeping the existing `rea/agent` consumer. The provider checks direct connections before native spawn and checks each queued external call before dispatch. It refuses execution under the same conditions as `./subprocess`, including protected owner files; engine names or read-only MCP annotations do not establish target confinement. Local policy changes or owner withdrawal close existing processes and settle their calls before releasing rule resources. This opt-in refuses unsupported native execution; it does not sandbox REA or protect independently configured MCP clients.

<a id="implementation"></a>
## Implementation

<details>
<summary>Maintainer details</summary>

The SQLite format has monotonic `SCHEMA_VERSION = 3` and application ID `DSTP`. Valid version 1 and 2 registries upgrade transactionally without changing their preferences or revision; earlier code refuses version 3 on reopening, so downgrade requires restoring a pre-upgrade backup. Version 1 cannot contain paths and versions before 3 cannot contain aliases. Format, application identity and preferences are read in one SQLite snapshot; every operation checks them again. Writes compare the caller's expected revision in a transaction. Lock conflicts return `busy` without committing, and damaged data is preserved.

The HTTP consumer checks before resolution and before each connection, including redirects. The resolver retains CNAMEs and A/AAAA records from the same answer packets, validates transaction/question identity, follows bounded chains and uses TCP for truncated UDP replies. Hosts-file aliases and localhost are handled without external lookup. The shared transport pins the validated addresses and retains NAT64 IPv4 aliases for rule and country checks. Unrelated answer records never become destinations.

The decision uses current rules and rechecks their revision after asynchronous resolution. Local rule changes and country-provider replacement cancel requests using the old generation; this does not roll back effects already sent. HTTP and file executors retain the rule owner's resources through native operation settlement and cleanup. Proxy address facts without literal binding remain unknown. Registry failure, cancellation and service disposal cannot authorize a connection.

The local file adapter checks direct service calls and rechecks writes inside the file lock, before staging and immediately before atomic publication. A change from another registry connection can refuse publication and remove staging residue. Withdrawal aborts admission and waits for active I/O and source iterators to close before releasing dependencies. The local filesystem's external-process path race remains: path revalidation does not provide kernel isolation against a hostile process replacing ancestors between validation and a syscall. Partially created parents or earlier completed effects are not rolled back.

File identity uses BigInt device and inode values without rounding Windows identifiers. Existing files with unavailable identities cannot be declared unrelated to protected files. Prospective absent files remain a separate state. DNS evidence is keyed by canonical hostname so one resource's aliases cannot overwrite each other's bindings; selectors outside the current port or database scope do not trigger DNS queries.

The independent registry does not change Session record types. Durable execution-audit events and SDK projections belong to the remaining audit integration. The archived development draft is not a supported database predecessor and is never silently imported.

</details>

<a id="model-experience"></a>
## Model Experience

This package adds no model request or tool definitions. Existing fetch, file and process calls can return a typed target-policy error. Effects come from the executing adapter, never from a model's claim that a command is safe.

#### KV Cache effect

No new prompt prefix is added. A refusal changes only the affected tool result.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Only explicitly composed guarded providers are covered. Structured file removal and renaming support local files and the matching SSH helper, not directory trees. Remote hard-link/mount identity, per-database bindings, database protocols, constrained commands, and browser/MCP/REA native execution still need adapters. Deployments must keep the remote runtime trusted and outside Agent-writable workspaces. Opaque proxy tunnels remain unsupported under protection; SSH proxy routing is also unfinished. Ordinary anonymous fetch still refuses private networks. DNS evidence cannot enumerate every hostname sharing an IP, and country data or CONNECT cannot attest physical forwarding. Default composition, owner UI, security-entry status and durable audit remain unfinished.

<a id="dev-note"></a>
## Dev Note

Tests include real local listeners, cross-connection SQLite conflicts, reopen/corruption checks, and a real Loader configuration with mandatory-provider withdrawal. RE2JS handles regex matching; ipaddr.js handles canonical IP networks. The implementation plan and remaining acceptance cases are recorded in [the target protection plan](../../../.agents/requirements/2026-10-26-target-protection.md).
