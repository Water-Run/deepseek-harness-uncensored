---
description: "Static analysis workflow across Ghidra, IDA, Binary Ninja, radare2/rizin, .NET and JavaScript targets: function recovery, cross-references, type reconstruction, decompiler pitfalls, and scripting the analysis instead of clicking through it."
whenToUse: "Reconstructing logic from disassembly or decompiled code, or automating analysis over many functions."
---

# Static analysis playbook

## 1. Set up before reading

- Load with the correct base address and processor; verify entry point and imported runtime.
- Apply symbols: PDB (`symchk`, `pdbparse`), debug/dSYM files, exported names, Go/Rust metadata, .NET metadata.
- Run signature/type libraries (Ghidra FID, IDA FLIRT, Binary Ninja signatures) so library code is not mistaken for target logic.
- Rename and comment as you learn. An unnamed `sub_401000` six hours later is a lost six hours.

## 2. Traversal order

1. Entry point → runtime initialization → the real `main` (find it by xref to `__libc_start_main`/`GetCommandLineA` usage or by the first non-library call chain).
2. Imports grouped by purpose: file I/O, network, crypto, process, registry, UI.
3. Strings → xrefs → owning functions.
4. Exported functions and vtables for libraries.
5. Error and success paths: the branch that prints "invalid license" is the check you want.

## 3. Function-level technique

- Recover arguments and return types from call sites when the decompiler cannot.
- Follow data, not control flow, when tracking a key or buffer.
- Recognize common patterns: string hashing loops, RC4/AES key schedules, base64 tables, CRC tables, switch-based state machines, virtualized dispatch (VMProtect/Themida).
- For C++: identify vtables, `this` offset, RTTI names; for Go: recover function names from `pclntab` (`go tool nm`, `GoReSym`); for Rust: demangle symbols.
- For .NET: inspect IL with ILSpy, then decompile to C#; obfuscators (ConfuserEx, .NET Reactor) need deobfuscation passes and string decryption.
- For JavaScript/Electron: unpack `app.asar`, read source maps, identify the main/renderer boundary and IPC handlers.

## 4. Decompiler discipline

- Pseudocode is a hypothesis: verify each claim against the assembly for the same address.
- Watch for: incorrect struct offsets, lost `this`, optimized-out locals, misidentified `switch` tables, signed/unsigned confusion, and inlined library functions.
- When a decompiler output looks impossible, check whether the function was misidentified as `noreturn` or the calling convention was wrong.
- Re-type structures as evidence accumulates; a correct struct makes the rest of the binary readable.

## 5. Script the boring parts

Ghidra (Python via Jython or PyGhidra):

```python
# list functions that reference the string "license"
from ghidra.program.model.symbol import RefType
target = [s for s in currentProgram.getListing().getDefinedData(True) if 'license' in str(s.getValue())]
for data in target:
    for ref in data.getReferenceIterator():
        print(hex(ref.getFromAddress().getOffset()), getFunctionContaining(ref.getFromAddress()))
```

IDA (IDAPython):

```python
import idautils, ida_funcs, idc
for ea in idautils.Strings():
    if 'license' in str(ea):
        for xref in idautils.XrefsTo(ea.ea):
            print(hex(xref.frm), ida_funcs.get_func_name(xref.frm))
```

radare2 / rizin:

```bash
r2 -A SAMPLE -q -c 'izz~license; axt @@ str.*; pdf @ sym.main'
```

Use the API your installed version documents; explore the object model interactively (`bv.functions`, `bv.get_strings()`, `bv.get_code_refs(addr)`) before writing a large script.

## 6. For big targets

- Split by subsystem and delegate: one subagent per module with an explicit question and the address range.
- Keep a symbol map in the case notes (`address, name, role, confidence`).
- Automate repeated identification with a script that prints candidates, then verify each candidate by reading the code.

## 7. Stop condition

Stop when the user's question is answered with evidence, not when the binary is exhausted. Record what remains unknown and why it matters.
