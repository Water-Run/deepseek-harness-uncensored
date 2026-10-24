# Frida recipes

Short, working hooks for common reverse-engineering questions. Adjust class and module names to the target.

## Bootstrap

```bash
frida -U -f com.example.app -l hooks.js --no-pause
frida -n app.exe -l hooks.js
frida-trace -U -f com.example.app -i 'open*' -i 'connect'
```

```javascript
function log(...args) { console.log(args.map(String).join(' ')); }
setImmediate(() => log('attached', Process.arch, Process.platform));
```

## Java layer

```javascript
Java.perform(() => {
  const C = Java.use('com.example.auth.License');
  C.validate.implementation = function (key) {
    const result = this.validate(key);
    log('key=' + key + ' result=' + result);
    return true;                       // force success when testing downstream logic
  };
});
```

```javascript
// enumerate loaded classes matching a pattern
Java.perform(() => {
  Java.enumerateLoadedClasses({
    onMatch(name) { if (name.toLowerCase().includes('crypto')) log(name); },
    onComplete() {},
  });
});
```

## Native exports

```javascript
const fn = Module.getExportByName('libnative.so', 'nativeSign');
Interceptor.attach(fn, {
  onEnter(args) {
    this.input = args[1].readUtf8String();
    log('sign input=' + this.input);
  },
  onLeave(retval) {
    log('sign output=' + retval.readUtf8String());
  },
});
```

## Find a symbol when the binary is stripped

```javascript
const base = Module.findBaseAddress('libnative.so');
const marker = 0xdeadbeef;             // constant found in the disassembly
const hits = [];
for (let offset = 0; offset < 0x80000; offset += 4) {
  if (Memory.readU32(base.add(offset)) === marker) hits.push(offset);
}
log(hits.map(h => '0x' + h.toString(16)).join(','));
```

## TLS interception

```javascript
// BoringSSL: dump the master secret keylog
const keylog = Module.getExportByName(null, 'SSL_CTX_set_keylog_callback');
Interceptor.attach(keylog, {
  onEnter(args) { log('keylog ctx=' + args[0]); },
});
```

```javascript
// OkHttp pinning (Android)
Java.perform(() => {
  const P = Java.use('okhttp3.CertificatePinner');
  P.check.overload('java.lang.String', 'java.util.List').implementation = function () { return; };
});
```

## File and process activity

```javascript
['open', 'fopen', 'CreateFileW', 'connect', 'send', 'recv'].forEach((name) => {
  const address = Module.findGlobalExportByName?.(name) ?? Module.findExportByName(null, name);
  if (address === null) return;
  Interceptor.attach(address, {
    onEnter(args) { log(name, 'called'); },
  });
});
```

```javascript
// log command execution on Windows
const create = Module.getExportByName('kernel32.dll', 'CreateProcessW');
Interceptor.attach(create, {
  onEnter(args) { log('cmd=' + args[1].readUtf16String()); },
});
```

## Anti-debug bypass

```javascript
const isDebuggerPresent = Module.getExportByName(null, 'IsDebuggerPresent');
Interceptor.replace(isDebuggerPresent, new NativeCallback(() => 0, 'int', []));
```

```javascript
const ntQuery = Module.getExportByName('ntdll.dll', 'NtQueryInformationProcess');
Interceptor.attach(ntQuery, {
  onLeave(retval) {
    // DebugPort / DebugObjectHandle: force "no debugger"
    const infoClass = this.infoClass;
    if (infoClass === 7 || infoClass === 0x1e) retval.replace(0);
  },
});
```

## Dumping a buffer after a call

```javascript
const recv = Module.getExportByName(null, 'recv');
Interceptor.attach(recv, {
  onEnter(args) { this.buffer = args[1]; },
  onLeave(retval) {
    const n = retval.toInt32();
    if (n > 0) log(hexdump(this.buffer, { length: Math.min(n, 256) }));
  },
});
```

## Practical notes

- Hooks on optimized (inlined) code may never fire; find a non-inlined boundary.
- `Java.perform` must wrap all Java work; native hooks can be installed at startup.
- Use `Interceptor.flush()` before long dumps to avoid losing buffered output.
- Record the Frida version and target build in the case file; a hook that works on one build is a hypothesis on the next.
