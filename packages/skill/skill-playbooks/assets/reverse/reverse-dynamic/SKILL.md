---
description: "Runtime analysis: debuggers, syscall and API tracing, Frida instrumentation, sandbox observation, unpacking from memory, and the anti-debug/anti-VM checks that break an analysis session."
whenToUse: "The behavior cannot be read statically, the sample is packed, or the question is about runtime effects."
---

# Dynamic analysis playbook

## 1. Build the observation harness first

- Disposable VM or container snapshot, host-only network plus a fake gateway, DNS sinkhole, and a capture point.
- Time sync, process monitor, registry monitor, file monitor, network monitor.
- A baseline snapshot of the clean system so you can diff files, registry keys, and services afterward.

Never run an unknown sample on the analysis host. If the task requires the real host, say so and keep the sample inert until the user confirms the environment.

## 2. Debugger workflow

| Platform | Debugger | Notes |
| --- | --- | --- |
| Windows | x64dbg, WinDbg | x64dbg for interactive, WinDbg for kernel and scripting |
| Linux | gdb + pwndbg/gef, lldb | `catch syscall`, `follow-fork-mode` |
| macOS | lldb | SIP and hardened runtime change what you can attach to |
| .NET | dnSpy, dotnet-dump | IL-level breakpoints are easier than native |
| Android | jdb, lldb-server, Frida | Frida is usually faster |

Entry breakpoints: `main`, the first API in the import table that matches the question (e.g. `CreateFileW`, `connect`, `CryptEncrypt`), or a string xref.

## 3. Tracing

```bash
# Linux syscalls and files
strace -f -s 256 -o trace.txt ./SAMPLE
ltrace -f -o libcalls.txt ./SAMPLE

# Windows: Procmon filter for Process Name is SAMPLE.exe
# ETW: wpr -start GeneralProfile -filemode; wpr -stop trace.etl
```

```bash
# network
tcpdump -i any -w capture.pcap
mitmproxy -p 8080 --set confdir=./mitm    # TLS interception needs the sample to trust your CA
```

## 4. Frida instrumentation

```bash
frida-ps -U
frida -U -f com.example.app -l hook.js --no-pause
frida-trace -U -f com.example.app -i 'open*' -i 'connect'
```

```javascript
// log every call to a native export
const target = Module.getExportByName('libc.so', 'connect');
Interceptor.attach(target, {
  onEnter(args) { console.log('connect fd=' + args[0].toInt32()); },
  onLeave(retval) { console.log('ret=' + retval.toInt32()); },
});

// dump a buffer after a function returns
Interceptor.attach(Module.getExportByName(null, 'recv'), {
  onLeave(retval) {
    const size = retval.toInt32();
    if (size > 0) console.log(hexdump(this.buffer, { length: size }));
  },
});
```

Java layer: `Java.perform`, hook the class that validates input, print `this` fields. The `reverse-mobile` playbook carries a ready-made Frida recipe set.

## 5. Unpacking

1. Break after the unpacking loop: watch for `VirtualAlloc`/`mmap` followed by a large write and a jump into the new region.
2. Dump the region at its virtual address and fix the section headers (PE: `Scylla`, `pe_unmapper`; ELF: `dumpmemory` in gdb or `/proc/PID/maps`).
3. Rebuild imports if the stub resolved them dynamically (Scylla IAT fix).
4. Return to `reverse-static` on the dump; note the original hash and the dump hash.

.NET packers and VMProtect/Themida need specialized handling; recognize the protector before promising a clean dump.

## 6. Anti-analysis

| Check | Behavior | Response |
| --- | --- | --- |
| `IsDebuggerPresent`, `NtQueryInformationProcess` | Different path or exit | Patch the check, or hook the API to return false |
| Timing (`rdtsc`, `QueryPerformanceCounter`) | Slow-path or crash | Hook the timer source |
| CPU count, RAM, device names | VM detection | Match the VM profile to a plausible host |
| MAC prefix, disk serial, BIOS strings | VM fingerprint | Normalize before running |
| Parent process, command line | Sandbox detection | Launch from the expected parent |
| Exception handlers, TLS callbacks | Early code before `main` | Break on TLS callback and exception dispatch |
| Self-checksumming | Patch detected | Patch at the consumer of the checksum, not the check |

Record every anti-analysis measure you bypassed; it is part of the answer.

## 7. Evidence

Save the trace files, pcaps, Frida logs, and dump hashes. Reference them in the case file with timestamps. Behavioral claims need a captured artifact, not a memory of a console.
