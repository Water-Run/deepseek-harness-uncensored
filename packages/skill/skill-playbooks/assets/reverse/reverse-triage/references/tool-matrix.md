# Reverse-engineering tool matrix

Named tools only; nothing here is bundled. Licenses are recorded for planning, not redistributed. Verify the current license before shipping anything that embeds a tool.

## Disassembly and decompilation

| Tool | Role | License (verify) |
| --- | --- | --- |
| Ghidra | Free decompiler and scripting | Apache-2.0 |
| IDA Pro / Hex-Rays | Commercial disassembler/decompiler | Commercial |
| Binary Ninja | Commercial reverse-engineering platform | Commercial |
| radare2 / rizin + Cutter | Scriptable disassembly, free | LGPL-3.0 / LGPL-3.0 |
| Hopper | Commercial macOS/Linux disassembler | Commercial |
| objdump, llvm-objdump | Basic disassembly | GPL-2.0 with GCC exception / Apache-2.0 |
| capstone, keystone | Disassembly/assembly libraries | BSD-3-Clause |
| LIEF | Binary parsing and patching | Apache-2.0 |
| pyelftools, pefile | Format parsing | Public domain / MIT |

## Dynamic analysis

| Tool | Role | License (verify) |
| --- | --- | --- |
| x64dbg | Windows debugger | GPL-3.0 |
| WinDbg | Windows kernel/user debugging | Proprietary (free) |
| gdb + pwndbg/gef | Linux debugging | GPL-3.0 / MIT |
| lldb | Cross-platform debugging | Apache-2.0 with LLVM exception |
| Frida | Dynamic instrumentation | wxWindows/LGPL |
| strace, ltrace | Syscall/library tracing | GPL-2.0 / GPL-2.0 |
| Process Monitor, API Monitor | Windows API observation | Proprietary (free) |
| mitmproxy | TLS interception | MIT |

## Managed code and mobile

| Tool | Role | License (verify) |
| --- | --- | --- |
| dnSpy / ILSpy | .NET decompilation | GPL-3.0 / MIT |
| JADX | Android decompilation | Apache-2.0 |
| apktool | APK resource/smali round-trip | Apache-2.0 |
| apksigner, zipalign | Android signing/alignment | Apache-2.0 |
| objc2swift, Hopper | Objective-C analysis | MIT / Commercial |
| reFlutter, Il2CppDumper | Flutter/Unity analysis | MIT / MIT |

## Analysis support

| Tool | Role | License (verify) |
| --- | --- | --- |
| YARA | Pattern matching | BSD-3-Clause |
| capa | Capability detection | Apache-2.0 |
| FLOSS | Obfuscated string extraction | Apache-2.0 |
| Detect It Easy (DIE) | Packer/compiler detection | MIT |
| binwalk, unblob | Firmware extraction | MIT |
| angr | Symbolic execution | BSD-2-Clause |
| z3 | SMT solver | MIT |
| pwntools | Exploit development | MIT |
| CyberChef | Encoding/decoding workbench | Apache-2.0 |
| REA (`morluto/rea`) | MCP bridge for agents over Hopper/Ghidra/IDA, JS/Electron, .NET, APK, adb | MIT |
| ida-pro-mcp (`mrexodia/ida-pro-mcp`) | IDA MCP bridge | MIT |
| GhidraMCP (`LaurieWired/GhidraMCP`) | Ghidra MCP bridge | Apache-2.0 |

## Choosing an analysis backend

- **No commercial license:** Ghidra + rizin + Frida + JADX + dnSpy/ILSpy.
- **Commercial IDA/Binary Ninja:** use its decompiler, but keep the case notes tool-independent so another analyst can continue.
- **Agent-integrated:** REA or an MCP bridge turns the decompiler into callable tools. Record the provider version in the case file; results differ between engine versions.
- **Multiple engines:** cross-check a suspicious decompilation in a second engine before building a conclusion on it.

## Notes

- Tool output is evidence only when you keep the version, command, and raw output.
- A plugin ecosystem (IDAPython, Ghidra scripts) is where most productivity lives; prefer a scripted pass over manual clicking for anything that repeats.
- Commercial tools require a real license; the harness does not supply, patch, or bypass them.
