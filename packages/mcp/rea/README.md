---
description: "Use the bundled REA runtime and use its tools in isolated reverse-analysis conversations."
kind: "package-reference"
---

# @deepseek-ai/dsh-rea

English | [中文](README.zh.md)

## Summary

The root service owns REA launch preferences and external processes. The `./agent` consumer is mounted only by the Reverse preset. REA is enabled by default and starts only when used. Saved opt-outs remain disabled; configuring it neither downloads software nor changes another client's settings.

## Configuration

Open Settings → Mode → Reverse configuration. The bundled REA works without executable paths. Desktop supplies Node 24.22.1; source launches use their Node process or `DSH_REA_NODE_PATH`. Custom Node and CLI paths are optional overrides. Save and check the connection. Optional fields select Ghidra, Java, an IDA MCP configuration, and a native provider. The check starts a temporary MCP process, reports its version and tools, checks configured paths, then closes it. A successful handshake does not certify an optional engine; engine versions and dependencies are checked when a sample is opened.

All preferences are Loader-managed settings. `startupTimeoutMs` defaults to 60000, `toolTimeoutMs` to 180000, and `catalogPageSize` to 20. Saving changed preferences closes existing processes. A conversation must reset its connection and reopen its sample after that change.

REA 6.9.0 was tested with Node 24.22.1, Ghidra 12.1.4, Java 27 and the bundled Frida 17.23.2 binding. Other engine versions remain subject to upstream version checks. REA 6.9.0 is pinned to [d74549e495c5](https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0). Optional analysis engines remain separately configured under their own licenses.

## Conversation ownership

`rea_tools` searches names and descriptions, paginates the complete catalog, and enables exact names. Selected tools enter the normal tool registry as `mcp__rea__*`, with upstream schemas, canonical MCP results and durable image handling. Their arguments are validated before external dispatch. The model can use the existing reverse-casebook workflow to record findings alongside sample identities and evidence.

Each live Agent owns its process and selected tools. Calls to one process are serialized; other Agents use separate processes. Discovery and every external call require the current conversation's full-access policy. A child conversation cannot call a parent's selected tool. Read-only quick questions cannot start REA. Reset, Agent disposal, configuration changes and plugin unload close owned processes; cancellation interrupts requests, and calls are never replayed automatically after failure.

The optional [`target-protection/rea`](../../guard/target-protection/README.md) provider replaces the root service with mandatory execution checks. It refuses native engines while their effects cannot be bounded to protected targets; full-access approvals and MCP read-only annotations do not bypass it. Policy revocation cancels running and queued calls and waits for the actual stdio process close before releasing the rule owner. The ordinary provider remains unrestricted by target rules and is not a substitute for this guarded composition.

## Model Experience

Only `rea_tools` is initially added to Reverse conversations. Discovery results describe available tools; enabling names adds only those definitions to later requests. Tool results and availability changes use existing Session logging. All 255 tools in the tested release remain discoverable without adding the complete catalog to every request.

#### KV Cache effect

The tool prefix changes when selected tools are added or reset. Stable selections retain the same names and schemas. Discovery and engine calls do not make auxiliary model requests.

## Known Limitations and Deferred Work

External engines execute on the local host and require full access. The bridge does not provide a sandbox, remote execution environment, or independent traffic proxy. Desktop bundles REA, its compatible Node runtime and npm dependencies, including Frida's binding. Ghidra, Java, IDA and Hopper remain optional external engines. REA's tool catalog is exposed; MCP resources, prompt templates and task-required tools are not adapted here. Frida acceptance covers owned local Windows targets and Linux attach and spawn targets. Linux attach targets explicitly permit the test parent and its descendants to debug them. Attachment to arbitrary existing processes, remote devices and commercial engines remains unverified; operating-system debugging permissions still apply.

DSHU applies a pinned [REA 6.9.0 lifecycle patch](../../../patches/rea-agents@6.9.0.patch) in both workspace and Desktop installations. Closing an owned paused spawn unloads its scripts, resumes the target and then detaches. On Windows, a local paused spawn without scripts first loads a no-op script through the same owned registration and cleanup path; initialization failure remains explicit. Failed cleanup remains explicit, and attached existing processes are not terminated. The upstream release and license remain identified separately from this local patch.

## Verification

`tests/rea.spec.ts` checks isolation, argument validation, cancellation, reset and live permission changes using owned local processes. `tests/rea.e2e.ts` uses a compatible `DSH_REA_TEST_NODE` and defaults to the bundled npm package; `DSH_REA_TEST_CLI` is an optional override; the optional native path additionally requires `DSH_REA_TEST_GHIDRA`, `DSH_REA_TEST_JAVA_HOME` and an owned `DSH_REA_TEST_BINARY`. Tests close processes and remove only their temporary directories. Frida fixtures retain both the original failure and any subsequent cleanup failure.

`tests/frida.e2e.ts` uses the same Node and CLI variables plus `DSH_REA_TEST_FRIDA_TARGET`, pointing to a compiled copy of `tests/fixtures/frida-target.c`. Compile without optimization and retain the function export (`cl /Od` on Windows; `cc -O0 -rdynamic` on Linux). The test copies the binary into a private directory and instruments only processes it creates. It checks changed return values, script unloading, connection reset, disposal, paused spawn and target exit. Linux attach uses the fixture's explicit `--allow-parent-debugger` option: [Yama's `PR_SET_PTRACER`](https://docs.kernel.org/admin-guide/LSM/Yama.html) permits its test parent and that parent's descendants, without changing system `ptrace_scope`. Run `pnpm exec vitest run --config vitest.e2e.config.ts packages/mcp/rea/tests/frida.e2e.ts --retry 0`. No model calls are made.

## References

[REA](https://github.com/morluto/rea) is maintained by morluto under MIT. This package distributes its pinned npm MCP server and preserves its license. The server and its complete dependency tree are unpacked from Desktop ASAR for standalone Node. It does not replace REA's analysis implementations. See the shared [MCP adapter](../mcp-client/README.md) for result validation and presentation.
