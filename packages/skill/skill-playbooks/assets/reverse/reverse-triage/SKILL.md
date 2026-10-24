---
description: "First-pass binary intake: hashes, format, architecture, packing and entropy, headers, imports, strings triage, signature tools, and a decision on the next analysis path. Load this first for any unknown sample."
whenToUse: "A new binary, library, firmware image, document, or package needs identification before deeper analysis."
---

# Sample triage playbook

Goal: know exactly what you are looking at, and choose the cheapest path that answers the user's question.

## 1. Capture immutable identity

```bash
node ../../shared/scripts/sample.mjs SAMPLE --out inventory.json
sha256sum SAMPLE
file SAMPLE
```

Record: SHA-256, size, format, architecture, endianness, entry point, subsystem, and the original path. Work on a copy; never patch the original.

## 2. Structural view

| Format | Quick read |
| --- | --- |
| PE | `pefile` (Python), `rabin2 -I`, `objdump -x`, PEStudio, CFF Explorer |
| ELF | `readelf -h -l -S`, `rabin2 -I`, `checksec`, `ldd` |
| Mach-O | `otool -l -L`, `rabin2 -I`, `jtool2`, `codesign -dvvv` |
| .NET | `dnfile`, ILSpy/dnSpy, `monodis` |
| APK/IPA | `apktool d`, `jadx`, `unzip -l`, `plutil` |
| Firmware | `binwalk`, `unblob`, `filesystem` signatures |
| Documents | `olevba`, `oletools`, `pdfid`, `pdf-parser` |

```bash
rabin2 -I SAMPLE          # arch, bits, endian, canary, nx, pic, stripped
rabin2 -zz SAMPLE | head  # strings with offsets
rabin2 -i SAMPLE          # imports
rabin2 -s SAMPLE          # symbols
checksec --file=SAMPLE
```

## 3. Packing and obfuscation

Signals: high entropy (>7.2) in a large section, few imports, section names like `UPX0/.aspack/.themida`, writable+executable sections, tiny code section with a large resource, TLS callbacks, `VirtualProtect`/`mprotect` on freshly written memory.

```bash
upx -d SAMPLE -o unpacked    # only for plain UPX
die SAMPLE                   # Detect It Easy
```

If packed: move to `reverse-dynamic`, dump after unpacking, then return to static analysis on the dump.

## 4. Strings that matter

Prioritize: URLs and domains, IP addresses, file paths, registry keys, user-agent strings, crypto constants, error messages, command names, mutexes, PDB paths, build toolchain strings, language runtimes (`Go build ID`, `rustc`, `.NET` metadata, `PyInstaller`, `Electron`, `Qt`).

Cross-reference each interesting string to the code that uses it — a string alone proves nothing. `rabin2 -zzq`, `strings -el` (UTF-16), and decompiler xrefs do that.

## 5. Signature and capability tools

```bash
capa -v SAMPLE                 # capability detection (MIT)
floss SAMPLE                   # obfuscated string extraction
yara -r rules/ SAMPLE          # family or behavior rules
```

Note the tool version with every result; capability names are heuristics, not proof.

## 6. Dynamic first look (bounded)

Run in a disposable VM or container with network monitoring. Capture: process tree, files written, registry changes, network connections, DNS, child processes. Ten minutes of observation usually beats an hour of static reading for behavior questions.

## 7. Decision

| Observation | Next |
| --- | --- |
| Managed code (.NET/Java) | `reverse-static` with ILSpy/JADX first |
| Native, not packed | `reverse-static` from entry and imports |
| Packed or self-decrypting | `reverse-dynamic`, dump, then static |
| Network client / protocol | `reverse-protocol` |
| License or activation logic | `reverse-patch-keygen` |
| Mobile package | `reverse-mobile` |
| Malicious behavior suspected | `reverse-malware` |

## 8. Record

Open the case and store the inventory:

```bash
node ../../shared/scripts/casefile.mjs init --kind reverse --slug SAMPLE-SLUG --objective "understand FEATURE"
node ../../shared/scripts/casefile.mjs evidence add --slug SAMPLE-SLUG --type hash --ref sha256:HASH --note "original sample"
```

Every later conclusion cites that hash. Two samples with the same name are different artifacts.
