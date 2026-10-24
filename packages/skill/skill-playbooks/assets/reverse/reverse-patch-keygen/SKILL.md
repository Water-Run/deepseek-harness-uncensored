---
description: "Patching, activation bypass, and key generation: locating license checks, choosing a patch strategy, rebuilding and re-signing the artifact, deriving key algorithms, and using symbolic execution when the math is hard."
whenToUse: "The task is to patch behavior, remove a check, restore a trial, or build a keygen for a sample the user owns."
---

# Patching and key generation

## 1. Localize the decision

Find the branch that decides the outcome, not the UI that displays it:

- Search strings: `invalid`, `expired`, `trial`, `license`, `activation`, `unregistered`.
- Follow the failure path upward to the comparison and the value it tests.
- Confirm the branch is actually evaluated: set a breakpoint, change a register, and observe the behavior change.

Record the address, module base, and file offset. Offsets differ between on-disk and in-memory layouts — name which one you mean.

## 2. Choose a strategy

| Strategy | When | Cost |
| --- | --- | --- |
| Patch the conditional jump | Single check | Smallest diff, easy to verify |
| Patch the comparison constant | Value check with one expected string | Breaks if the constant is used elsewhere |
| Return success from the validator | Centralized function | Clean if all callers funnel through it |
| Hook at runtime | Signed binary, anti-tamper | Needs a loader, survives updates |
| Emulate the algorithm and generate a valid key | Keygen request | Highest effort, most portable |

Do not patch the check's caller if the check has side effects the caller depends on.

## 3. Apply and rebuild

```bash
# file offset from a virtual address (PE)
python -c "import pefile; pe=pefile.PE('app.exe'); print(hex(pe.get_offset_from_rva(0x401000)))"

# patch bytes
python - <<'PY'
data = bytearray(open('app.exe','rb').read())
data[0x1234:0x1236] = bytes([0x90, 0x90])
open('app.patched.exe','wb').write(data)
PY

# ELF / Mach-O structural edits and signature-aware patching
python -c "import lief; b=lief.parse('app'); ...; b.write('app.patched')"
```

Re-sign what the platform requires:

```bash
codesign --force --deep --sign - App.app          # ad-hoc, local run only
apksigner sign --ks KEYSTORE app.patched.apk
osslsigncode sign -certs cert.pem -key key.pem -in app.exe -out app.signed.exe
```

Verify: run the patched artifact, exercise the patched path, and confirm the original failure is gone without breaking adjacent behavior.

## 4. Derive the key algorithm

1. Locate the validator and trace how the input becomes a comparison value.
2. Identify primitives: hash, HMAC, CRC, modular exponentiation, custom mixing.
3. Lift it into a language you can test: Python reproduction of the algorithm, compared against real outputs captured from the binary.
4. Confirm with multiple real inputs; one match is a coincidence.

For math-heavy validators, symbolic execution finds an input without a full reimplementation:

```python
import angr
proj = angr.Project('app', auto_load_libs=False)
state = proj.factory.entry_state()
simgr = proj.factory.simulation_manager(state)
simgr.explore(find=lambda s: b'valid' in s.posix.dumps(1), avoid=lambda s: b'invalid' in s.posix.dumps(1))
print(simgr.found[0].posix.dumps(0))
```

`z3` solves constraint systems extracted from the validator:

```python
from z3 import Solver, BitVec, sat
key = BitVec('key', 32)
s = Solver()
s.add((key * 0x41c64e6d + 0x3039) & 0xffffffff == TARGET)
print(s.model() if s.check() == sat else 'unsat')
```

## 5. Handle anti-tamper honestly

- Checksums: patch the comparison input, not the stored checksum, unless you can recompute it.
- Signature checks: local debugging can bypass in memory; a redistributable artifact needs a real signing identity. Say which one the user is asking for.
- Integrity beacons: watch network traffic after patching; a silent call-home invalidates "offline patch" claims.

## 6. Deliver

- Patch diff: original bytes, patched bytes, file offset, RVA, and the reason.
- Reproduction steps: exact commands that produce the patched artifact from the original hash.
- Keygen: source plus test vectors (input → expected key) verified against the real binary.
- Explicit statement of what was verified and what remains unverified.
