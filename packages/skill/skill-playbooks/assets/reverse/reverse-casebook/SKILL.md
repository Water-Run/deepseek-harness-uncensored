---
description: "Keep reverse-engineering work reusable across conversations: the case folder, sample inventory, symbol map, hypothesis ledger, evidence hashes, and the report that another analyst can pick up without re-deriving everything."
whenToUse: "Starting a multi-session analysis, returning to an old sample, or handing work to another analyst or subagent."
---

# Reverse-engineering casebook

Analysis dies when it lives only in a chat transcript. Everything durable goes on disk, keyed by sample hash.

## Folder layout

```
<workspace>/.reverse/<slug>/
  case.json            # targets (samples), evidence, findings (managed by casefile.mjs)
  inventory.json       # sample.mjs output for each artifact
  notes/               # one markdown file per analysis thread
  symbols.md           # address/module -> name -> role -> confidence
  hypotheses.md        # open questions with the discriminating test
  dumps/               # unpacked images, memory dumps, patched copies
  captures/            # pcaps, HARs, Frida logs, traces
```

## Register the artifact

```bash
node ../../shared/scripts/sample.mjs samples/APP --out inventory.json
node ../../shared/scripts/casefile.mjs init --kind reverse --slug APP-SLUG --objective "reconstruct FEATURE"
node ../../shared/scripts/casefile.mjs target add --slug APP-SLUG --value APP.exe --label sample --note "sha256 from inventory"
node ../../shared/scripts/casefile.mjs evidence add --slug APP-SLUG --type trace --ref captures/connect.log --note "first C2 handshake"
node ../../shared/scripts/casefile.mjs finding add --slug APP-SLUG --title "license check compares HMAC" --severity info --target sample --evidence E-0001 --note "validator at 0x401a20"
```

## Symbol map

Keep one table per module. Example:

| Address / offset | Module | Name | Role | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| `0x401a20` | app.exe | `validate_license` | Compares HMAC-SHA256 of key with embedded digest | high | static + breakpoint |
| `0x402100` | app.exe | `sub_402100` | Unknown dispatcher, 14 cases | low | static only |

Rule: never rename a function to a guess without recording the confidence and the evidence. A wrong name costs more than `sub_`.

## Hypothesis ledger

```markdown
## H-0003 Config is RC4-encrypted with a per-build key
- Test: hook the decryptor, dump input/output, compare with known RC4 test vectors
- Status: open
- Discriminating evidence: keystream repeats after 256 bytes if RC4
- Result: confirmed, key `A1 B2 ...` at .rdata:0x5c10
```

Close each hypothesis with the result, not with "probably". This is what makes a later session productive.

## Cross-session reuse

- New conversation: read `case.json`, `symbols.md`, and `hypotheses.md` before touching the binary.
- Subagent: hand it the case directory path, the exact question, and the address range. Ask for a written result that cites evidence IDs.
- Different sample, same family: copy the symbol map pattern and reuse the naming scheme, never the addresses.

## Evidence discipline

- Every artifact has a SHA-256; name files by hash prefix, not by "dump2".
- Runtime captures include timestamps and the exact commandline used to produce them.
- A patched binary keeps its original hash in the case file and its own hash in `dumps/`.
- Distinguish observed bytes from decompiler interpretation in every note.

## Hand-off summary

End a session with a five-line summary: what was established, what is open, the next discriminating test, the files to read first, and the sample hashes. That summary is the difference between a resumable engagement and a restart.
