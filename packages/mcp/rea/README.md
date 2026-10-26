---
description: "Configure an installed REA runtime and use its tools in isolated reverse-analysis conversations."
kind: "package-reference"
---

# @deepseek-ai/dsh-rea

English | [中文](README.zh.md)

## Summary

The root service owns REA launch preferences and external processes. The `./agent` consumer is mounted only by the Reverse preset. REA is disabled by default; configuring it does not download software or change another client's settings.

## Configuration

Open Settings → Mode → Reverse configuration. Supply a physical Node executable and `rea-agents/scripts/rea.mjs`, enable REA, save, and check the connection. Optional fields select Ghidra, Java, an IDA MCP configuration, and a native provider. The check starts a temporary MCP process, reports its version and tools, checks configured paths, then closes it. A successful handshake does not certify an optional engine; engine versions and dependencies are checked when a sample is opened.

All preferences are Loader-managed settings. `startupTimeoutMs` defaults to 60000, `toolTimeoutMs` to 180000, and `catalogPageSize` to 20. Saving changed preferences closes existing processes. A conversation must reset its connection and reopen its sample after that change.

REA 6.8.0 was tested with Node 24.22.1, Ghidra 12.1.4 and Java 27. That REA release rejects Ghidra 12.2; its supported-version checks remain active. Install REA and optional engines separately, respecting their licenses.

## Conversation ownership

`rea_tools` searches names and descriptions, paginates the complete catalog, and enables exact names. Selected tools enter the normal tool registry as `mcp__rea__*`, with upstream schemas, canonical MCP results and durable image handling. Their arguments are validated before external dispatch. The model can use the existing reverse-casebook workflow to record findings alongside sample identities and evidence.

Each live Agent owns its process and selected tools. Calls to one process are serialized; other Agents use separate processes. Discovery and every external call require the current conversation's full-access policy. A child conversation cannot call a parent's selected tool. Read-only quick questions cannot start REA. Reset, Agent disposal, configuration changes and plugin unload close owned processes; cancellation interrupts requests, and calls are never replayed automatically after failure.

## Model Experience

Only `rea_tools` is initially added to Reverse conversations. Discovery results describe available tools; enabling names adds only those definitions to later requests. Tool results and availability changes use existing Session logging. All 229 tools in the tested release remain discoverable without adding the complete catalog to every request.

#### KV Cache effect

The tool prefix changes when selected tools are added or reset. Stable selections retain the same names and schemas. Discovery and engine calls do not make auxiliary model requests.

## Known Limitations and Deferred Work

External engines execute on the local host and require full access. The bridge does not provide a sandbox, remote execution environment, or independent traffic proxy. The app does not bundle REA, Node for REA, Ghidra, IDA, Hopper or Frida. REA's tool catalog is exposed; MCP resources, prompt templates and task-required tools are not adapted here. Frida and commercial engines were not exercised in the current acceptance run.

## Verification

`tests/rea.spec.ts` checks isolation, argument validation, cancellation, reset and live permission changes using owned local processes. `tests/rea.e2e.ts` uses explicit `DSH_REA_TEST_NODE` and `DSH_REA_TEST_CLI` paths; the optional native path additionally requires `DSH_REA_TEST_GHIDRA`, `DSH_REA_TEST_JAVA_HOME` and an owned `DSH_REA_TEST_BINARY`. Tests close processes and remove only their temporary directories.

## References

[REA](https://github.com/morluto/rea) is maintained by morluto under MIT. This package reuses its installed MCP server; it does not copy or replace REA's analysis implementations. See the shared [MCP adapter](../mcp-client/README.md) for result validation and presentation.
