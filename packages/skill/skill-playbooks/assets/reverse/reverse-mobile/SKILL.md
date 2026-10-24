---
description: "Android and iOS analysis: package anatomy, JADX and apktool decompilation, native libraries, Frida hooks, SSL pinning and root detection bypass, Flutter and React Native targets, and repackaging with verification."
whenToUse: "The artifact is an APK, AAB, IPA, or a mobile app's behavior is the question."
---

# Mobile analysis playbook

## 1. Package anatomy

```bash
# Android
unzip -l app.apk | head -40
apktool d app.apk -o app-decoded            # resources + smali
jadx -d app-java app.apk                    # Java/Kotlin source
apksigner verify --print-certs app.apk
aapt2 dump badging app.apk

# iOS
unzip -o app.ipa -d app-ipa
plutil -p app-ipa/Payload/App.app/Info.plist
otool -L app-ipa/Payload/App.app/App
```

Look for: `classes*.dex`, `lib/<abi>/*.so`, `assets/`, `res/raw/`, `META-INF/`, Flutter `libapp.so`, React Native `index.android.bundle`, Hermes bytecode, and embedded config/keys in `res/values/strings.xml` or assets.

## 2. Decompilation priorities

1. `AndroidManifest.xml`: exported components, permissions, deep links, `networkSecurityConfig`, `debuggable`.
2. Network layer: Retrofit/OkHttp interceptors, certificate pinning config, base URLs, API keys.
3. Auth: token storage, refresh logic, biometric gates, root/tamper checks.
4. Crypto: hardcoded keys, custom JNI implementations.
5. Native libs: JNI entry points (`Java_*`), string obfuscation, packers (Bangcle, Jiagu, DexGuard).

Obfuscation: map R8/ProGuard names, decrypt string tables, and rename in JADX before reading logic. DexGuard/StringFog need targeted decryption hooks.

## 3. Runtime instrumentation

```bash
frida-ps -Uai
frida -U -f com.example.app -l hooks.js --no-pause
objection -g com.example.app explore      # quick wins: sslpinning disable, root disable
```

```javascript
Java.perform(() => {
  const C = Java.use('com.example.net.ApiClient');
  C.getToken.implementation = function () {
    const token = this.getToken();
    console.log('token=' + token);
    return token;
  };
});
```

Native:

```javascript
const fn = Module.getExportByName('libnative.so', 'Java_com_example_Native_sign');
Interceptor.attach(fn, {
  onEnter(args) { console.log('arg=' + args[2].readCString()); },
  onLeave(retval) { console.log('ret=' + retval); },
});
```

## 4. Bypass matrix

| Control | Approach |
| --- | --- |
| SSL pinning (OkHttp `CertificatePinner`) | Hook `check` to return void, or replace the pin set |
| TrustManager / HostnameVerifier | Hook `checkServerTrusted` / `verify` |
| Network Security Config pins | Patch the XML or hook the config loader |
| Root detection | Hook `Runtime.exec`, `File.exists`, SafetyNet/Play Integrity responses |
| Emulator detection | Spoof build props, hook `Build` fields |
| Flutter pinning | Hook BoringSSL `SSL_CTX_set_custom_verify` in `libflutter.so` |
| React Native pinning | Hook the JS bundle's fetch/axios layer or the native module |
| Integrity checks | Hook the signature/hash comparison, not the file |

Verify each bypass by completing the real request and reading the response, not by the absence of a crash.

## 5. Repackaging

```bash
apktool b app-decoded -o app-patched.apk
zipalign -f -p 4 app-patched.apk app-aligned.apk
apksigner sign --ks KEYSTORE app-aligned.apk
```

For iOS, a re-signed IPA needs a provisioning profile that matches the bundle id and entitlements; `codesign -f -s IDENTITY` plus `ldid` for jailbroken devices. State which environment the result targets.

## 6. Flutter and cross-platform

- `libapp.so` contains AOT Dart snapshots; use `reFlutter`/`Doldrums`-style tooling or hook BoringSSL for TLS.
- React Native: decompile `index.android.bundle` with `react-native-decompiler` or Hermes bytecode tools; the JS layer usually holds the API logic.
- Unity: `global-metadata.dat` + `libil2cpp.so`, use Il2CppDumper and then analyze in Ghidra.

## 7. Evidence

Record package hash, signing certificate, app version/build, device/emulator image, and every hook with its target. Mobile findings are version-specific; a bypass on one build is not a claim about the next.
