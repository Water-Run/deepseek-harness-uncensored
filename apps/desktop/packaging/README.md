---
description: "Build DSHU Desktop installers locally, choose deployment and signing mode, and retrieve artifacts and diagnostics. This guide keeps build operations separate from publishing and installed-application qualification. Platform signing details and shared-runner risks must be checked before using hardware credentials."
---

# Desktop packaging

English | [中文](README.zh.md)

## Summary

Build DSHU Desktop installers locally, choose deployment and signing mode, and retrieve artifacts and diagnostics. This guide keeps build operations separate from publishing and installed-application qualification. Platform signing details and shared-runner risks must be checked before using hardware credentials.

## Table of Contents

- [Choose a build path](#choose-a-build)
- [Release versions](#release-versions)
- [Configuration and local builds](#configuration-and-local-builds)
- [Windows Actions packaging](#windows-actions)
- [macOS self-hosted packaging](#macos-actions)
- [Unsigned Windows test installer](#unsigned-windows-test-installer)
- [Local macOS DMG without release signing](#local-macos-dmg-without-release-signing)
- [macOS release signing and diagnostics](#macos-release-signing)
- [Directory builds and preparation](#directory-and-preparation)
- [Local Official bundles from a loopback registry](#local-official-bundles-from-a-loopback-registry)
- [Runtime file selection and installation checks](#runtime-file-selection)
- [Desktop runtime preparation](#desktop-runtime-preparation)
- [Installation and release verification](#verification)

<a id="choose-a-build"></a>

## Choose a build path

Run local commands from the repository root after installing locked dependencies. Use the platform-specific local commands; this checkout has no active packaging workflow. Choose test or production deployment independently from signed or unsigned mode. Read [Windows signing and runner operations](../windows-signing/README.md#trust-and-isolation) before any Windows signed build or shared-runner use. Installation is separate from packaging; [publication](../publishing/README.md) is a further explicit operation.

Set `DSH_DESKTOP_PACKAGE_CACHE_DIR` to an absolute build-cache directory for reuse across checkouts; see [cache configuration and lifecycle](#desktop-runtime-preparation).

<a id="release-versions"></a>

## Release versions

Use the independent DSHU version in `apps/desktop/package.json`; the root package version identifies the DSH engine and does not determine the installer version. Local packaging within an existing authorization does not require another version confirmation. A public release needs its own publication authorization and a version checked against existing GitHub tags and assets.

Omitting `--build-version` keeps the DSHU product version. Numbered test builds preserve a prerelease product version and append `.YYYYMMDD.index`; stable product versions append `-test.YYYYMMDD.index` instead. The tracked manifests are not rewritten.

| DSHU product | Unnumbered Desktop | Numbered test example |
|---|---|---|
| `0.1.0` | `0.1.0` | `0.1.0-test.20261103.1` |
| `0.2.0-alpha.1` | `0.2.0-alpha.1` | `0.2.0-alpha.1.20261103.1` |

`--build-version auto` uses the build host's date and the next index from this target's local DSHU artifacts, including retained run directories. It ignores official DSH filenames and does not access remote storage. The retained CI version formatter uses a UTC date, workflow run number and attempt; no workflow invokes it in this checkout. Neither mechanism reserves a public version.

```sh
pnpm --dir apps/desktop run package:win:x64:unsigned --build-version auto
```

Packaging creates neither uploads nor release tags. Old cloud publishing entry files return exit code 1 before reading configuration or credentials; see the [migration instructions](../publishing/README.md). Publish reviewed artifacts separately through this repository's GitHub Releases. Every artifact records `dshBuildCommit` and `dshBuildDirty`.

Signed DSHU packages use the `latest` GitHub release channel; unsigned inspection builds contain no automatic-installation feed. A `-test.<date>.<sequence>` build ranks below its stable base and cannot automatically upgrade a higher installed version. Automatic downgrade remains disabled; an automatic corrective release needs a product version bump. See [release automation status](../publishing/ci/README.md).

<a id="configuration-and-local-builds"></a>

## Configuration and local builds

DSHU packages retain HARNESS / UNCENSORED branding independently of signing or build channel. Application and installer names identify DeepSeek Harness Uncensored. An unsigned build remains unsigned; the brand does not imply an official DSH release or verified signature.

Set `DSH_PACKAGING_CONFIG_DIR` to the absolute machine configuration directory and `DSH_PACKAGING_PRESET` to `test` or `production` for local Windows commands. The loader reads `presets/<preset>.env`; signed commands additionally read `secrets/windows-signing.env`. Relative certificate and SignTool paths resolve beside the file declaring them. Public presets reject credentials, and the signing file cannot override public settings. Missing configuration fails without falling back to `.env.windows`; commands without a preset retain the existing dotenv behavior. Unsigned and preparation-only presets never read the signing file. Cache maintenance also reads only public preset settings. Signed DSHU packages use the repository GitHub update source. Local preset commands with `--build-version auto` number from local artifacts only; The retained CI formatter uses a run number and attempt.


Outside machine-preset mode, packaging, upload, and manual macOS signature verification (except local unsigned macOS builds) read `apps/desktop/.env.windows` or `.env.macos`, selected by target platform. Copy the [Windows template](../.env.windows.example) or [macOS template](../.env.macos.example) and fill in the local settings; Git ignores both local files, and packaged artifacts exclude them. Release fields come only from the selected configuration files, without fallback to system or shell variables; `PATH`, proxies, and build-tool settings remain inherited. The published version is an argument rather than a release field, and upload reads it from the completion record the packaging run wrote. Files use UTF-8 with optional BOM; relative certificate, SignTool, Apple API key, and keychain paths resolve from `apps/desktop`, values are not shell-expanded, and passwords containing `#` or spaces need quotes. Windows CI reads the same machine presets.

Every package command checks the application ID and its mode-specific update and signing configuration before building or downloading, then probes the external tools the run will use: the archive reader, and on a Windows target the installer compiler. macOS checks the identity, Team ID, one complete notarization strategy, readable local `CSC_LINK` p12 file, explicit `CSC_KEY_PASSWORD`, and referenced API key and keychain files; Windows checks the public code-signing certificate, SignTool file, container name, and PIN format. Windows preparation-only builds and explicit unsigned builds on either platform do not require signing credentials. Configuration checks do not authenticate the PIN, log in to the token, unlock a keychain, or contact Apple; actual signing and notarization perform those checks. Automatic build numbering is local under both ordinary builds and `--check`. Run the same checks separately:

```sh
pnpm --dir apps/desktop run check:package
```

`prepare:desktop` is not a prerequisite:

```sh
pnpm run package:desktop
```

Release automation uses fixed target commands so runtime preparation, dsh preparation, and electron-builder receive the same platform and architecture:

```sh
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:mac:x64
pnpm run package:desktop:win:x64
```

The macOS arm64 command requires Apple Silicon. The macOS x64 command runs on Intel macOS or Apple Silicon with Rosetta. The Windows x64 command requires Windows x64. Linux is not a supported Desktop release target.

Both release and local unsigned macOS DMGs use LZMA compression (`dmg.format: 'ULMO'`) in [the electron-builder configuration](../scripts/electron-builder-config.mjs). A [build-time patch](../../../patches/app-builder-lib@26.17.0.patch) adds this format to the pinned builder's validation and TypeScript declarations.

Each target owns its packed package inputs, prepared runtime, package set, dsh tree, pnpm preparation state, unpacked application, update metadata, and final artifacts under `apps/desktop/.desktop-build/targets/<target>/`. The Electron archive cache remains shared under `.desktop-build/downloads` because every archive name includes its version, platform, and architecture and is verified before extraction. A target build never consumes another target's mutable preparation state.

<a id="windows-actions"></a>

## Windows Actions packaging

This checkout has no active Windows packaging workflow. Use the local unsigned command below; do not follow upstream Actions links or expect retained CI artifacts. A future DSHU workflow must preserve its independent product identity and publish only to the DSHU repository. See [automation status](../publishing/ci/README.md).

<a id="macos-actions"></a>

## macOS self-hosted packaging

This checkout has no active macOS packaging workflow or registered runner commitment. Local macOS commands remain available below. Configure signing and notarization on the Mac build host using the [signing instructions](#macos-release-signing); a Windows build does not verify macOS delivery.

<a id="unsigned-windows-test-installer"></a>

## Unsigned Windows test installer

On Windows x64, use the complete unsigned packaging command for local installation testing:

```sh
pnpm run package:desktop:win:x64:unsigned
```

The command reads `.env.windows` and requires `DSH_DESKTOP_APP_ID` and the [mandatory-update policy settings](../README.md#mandatory-update-policy), including a real HTTPS service origin. The local run and CI use Node 24; the remaining tools are the root `packageManager` version of pnpm, Git, PowerShell 7 (`pwsh`), tar, Python, Visual C++ Build Tools and a Windows SDK. Set `PYTHON` when Python is absent from `PATH`. It writes the installer to `.desktop-build/targets/win-x64/unsigned-artifacts/`, omits ordinary automatic-update configuration, strips signing credentials, and creates no release completion record. EV and upload credentials are unnecessary. Signed packaging and upload retain their release requirements.

Run `pnpm install --frozen-lockfile`, then `pnpm run package:desktop:win:x64:unsigned --check` to validate configuration and tooling before the full command above. Packaging performs its own complete build and isolated runtime smoke without an online model. Stage logs remain under `.desktop-build/packaging-runs/`; a successful build alone does not qualify the installer. Dependency installation and runtime preparation need access to npm, GitHub release assets and nodejs.org; use the existing registry and proxy configuration when the network requires it. Caches and tool locations belong to the build machine, not tracked personal paths.

<a id="local-macos-dmg-without-release-signing"></a>

## Local macOS DMG without release signing

After `pnpm install`, run one command from the repository root. No `.env.macos`, Apple account, certificate, or update service configuration is required:

```sh
pnpm run package:desktop:mac:arm64:unsigned
pnpm run package:desktop:mac:x64:unsigned
```

Add `--check` to validate local configuration and tools without building, or `--dir` to stop at the unpacked application. The DMG is `apps/desktop/.desktop-build/targets/<target>/unsigned-artifacts/runs/<run-id>/deepseek-harness-uncensored-<version>-mac-<arch>-unsigned.dmg`. After all checks pass, the command prints `DMG:` followed by its absolute path. Open it and copy the application to a local test directory.

These commands ignore `.env.macos` and inherited release settings, use `com.deepseek.dsh.uncensored` as the app ID, and omit automatic-update and mandatory-update configuration. Build tools, standard network proxies, and `DSH_DESKTOP_NPM_REGISTRY` remain available from the shell. They skip Developer ID signing, Apple notarization, temporary signing keychains, and notarization proxy changes. Electron receives a local ad-hoc signature without certificates so the modified executable can run; the DMG is unsigned. Both preparation and the assembled application still run runtime integrity and smoke checks. Local builds omit update feeds, ZIPs, and release completion records, and the upload commands cannot publish them. macOS may require approval in System Settings → Privacy & Security to open an unnotarized application.

<a id="macos-release-signing"></a>

## macOS release signing and diagnostics

The signed macOS configuration uses the required release environment instead of accepting whichever certificate appears first in a keychain. It rejects empty values, a malformed Team ID, a signing identity that includes electron-builder's unsupported `Developer ID Application:` prefix, and incomplete notarization credentials. Signed macOS packaging requires the configured identity and its private key. Runtime preparation applies that identity, a secure timestamp, and hardened runtime to every embedded Mach-O file; after signing the application, a deep strict check rejects any other leaf authority or Team ID before artifact creation. The signed fixed-target macOS installer commands create separate copies of the signed application and run two artifact lanes concurrently. One lane notarizes and staples the App before generating the ZIP and its update metadata. The other encloses its signed App copy in a signed DMG, then notarizes, staples, and verifies the DMG; its inner App has no individually stapled ticket. Both lanes must finish successfully before their artifacts reach the final directory and the release completion record is written. Signed directory-only commands also require notarization credentials and wait for Apple notarization and App stapling. The [parallel notarization decision](../../../.agents/notes/implemented/process/2026-09-09-parallel-macos-notarization.md) owns copy isolation and container ticket semantics. `CSC_LINK` must name a local p12 containing the Developer ID Application certificate and private key; URLs and Base64 inputs are not supported. `CSC_KEY_PASSWORD` is its export password, not an Apple account or login password; an explicitly empty value supports an unencrypted p12. Before building, packaging creates and unlocks a private temporary keychain, imports the p12, authorizes signing, and signs a small probe. Runtime and App signing use this keychain explicitly; existing login keychains require no setup or manual unlocking. Child processes receive its path without the p12 password. The keychain is deleted after success or ordinary failure; CI must clean temporary credentials after forced termination. Ephemeral CI writes the certificate and `.env.macos` from its secret store, restricts file access, and deletes both after the job; self-hosted machine presets retain private files outside the checkout. Ambient `CSC_NAME` and certificate discovery order do not select the release owner. Notary credentials may instead use electron-builder's complete Apple ID or keychain-profile strategy. The two macOS identity variables are also required when repeating the application check manually with `pnpm --dir apps/desktop run verify:mac-signature -- <path-to-app>`.

macOS signing visits real files without following Framework symlink aliases. PAK resources retain all shipped languages and are sealed by the enclosing Framework or application signature instead of receiving individual signatures. The [release policy](../../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.md) owns the dependency patch and verification requirements.

macOS runtime preparation caches verified single-architecture Mach-O signatures in `.desktop-build/targets/<target>/signature-cache` unless `DSH_DESKTOP_MACOS_SIGNATURE_CACHE_DIR` selects external storage. An explicit path must be absolute and already exist, contain no linked ancestors, and be owned by the current account with mode `0700` and read/write/search access; invalid or empty settings fail preflight without fallback. Omit the field to retain target-local storage. Keys include input bytes and permissions, the signing probe’s actual leaf certificate, identifier, entitlement bytes, macOS version, and signing tools and policy. Git commits do not determine reuse: uncommitted byte changes invalidate the affected file. Every hit verifies cached bytes, the strict signature, certificate, identifier, entitlements, secure timestamp and hardened runtime before replacing an unchanged input. Universal binaries are signed each time. Runtime integrity and smoke checks, App signing, and Apple notarization still run. The cache requires trusted local build storage. Cache corruption or unsafe links fail the build; stop packaging before deleting the affected cache directory and retrying. Successful signing stages prune complete entries to a one-GiB payload budget; interrupted temporary entries require manual removal. Concurrent eviction can fail a reader safely. Logs report hit, miss and uncached counts.

Mac package commands print `DESKTOP_PACKAGING_RECORD` with a unique directory under `apps/desktop/.desktop-build/packaging-runs/`. After reading local configuration, each run retains `run.json` (published version, product version, Git commit, dirty-worktree flag, target and Node version), `events.jsonl` (timestamped phases, durations, parallel output attribution and proxy restoration), redacted child `stdout.log` / `stderr.log`, and `result.json` (overall outcome, stage results and artifact directory). Events also record pack concurrency and whether each proxy is configured. Logs survive failures and later builds; no automatic deletion runs. Missing `result.json` means completion is unconfirmed. Known credential values are redacted; environments and notarytool authentication arguments are not recorded. Runtime preparation records package staging, installation, materialization, signing, manifests, smoke checks, descriptor verification and cleanup separately. Nested phase durations overlap and must not be added together.

App and DMG notarization each record a submission ID and separate `notarytool:upload:*` and `notarytool:wait:*` durations. Upload uses `submit --no-wait` and includes authentication, local validation, transfer and server acceptance; it is not pure transfer time. Waiting starts after that command returns and includes polling and remaining Apple processing; Apple can start processing before upload submission returns. Apple status and diagnostic logs are retained, including rejection; signature checks, acceptance checks and stapling remain owned by `@electron/notarize`. Directory-only package commands use this same measured App notarization path. Individual subprocess output remains live in the terminal, while phase failures and nested errors are retained in the journal. Both platforms record parent-process packaging failures and print redacted diagnostics, including proxy recovery instructions, to the terminal. The configuration-only `check:package` command creates no run log.

Mac packaging reads these tuning fields from `.env.macos`:

| Setting | Default | Scope |
|---|---|---|
| `DSH_DESKTOP_MACOS_PACK_CONCURRENCY` | `4` | Workers for first-party and vendor workspace tarballs; requires a positive integer. |
| `DSH_DESKTOP_MACOS_ZIP_COMPRESSION_LEVEL` | `3` | Final update ZIP compression, integer `0`–`9`; lower levels trade larger downloads for shorter builds. App notarization archives and DMG compression are unchanged. |
| `DSH_DESKTOP_MACOS_DOWNLOAD_PROXY` | Empty | HTTP/HTTPS proxy origin for Electron, runtime assets, pnpm installation and builder downloads. |
| `DSH_DESKTOP_MACOS_NOTARIZATION_PROXY` | Empty | HTTP proxy origin for Apple tools through temporary system proxy settings. |

The proxy fields are independent and reject URL credentials, paths, queries and fragments. Empty values preserve inherited networking. An explicit download proxy replaces child-process proxy variables and bypasses local hosts only; it does not change system settings. Company proxy addresses belong in the ignored local file; see internal documentation for addresses.

Apple tooling uses the active macOS network service's HTTP/HTTPS proxies. Configured notarization routing checks proxy reachability, saves that service's settings, enables the proxy around both artifact lanes, and restores the saved settings after both lanes settle. An originally disabled proxy with an empty server and port zero is restored by disabling it; the temporary server and port may remain stored but inactive. Directory-only builds apply it to App notarization after the signed directory build. This temporarily affects other applications and requires permission to change system proxies; PAC, auto-discovery, SOCKS and authenticated proxy configurations must be disabled first. Packaging and recovery acquire the same per-user POSIX file lock before reading recovery data or changing proxies; process exit releases ownership, while the lock file remains in place. The lock loads `@deepseek-ai/node-addon-system/flock` at first use rather than at script start, so `check:package` and the packaging entry load on a checkout that has not built `native/system`; when the host addon binary or the entry's JavaScript is missing at lock time, the loader runs `pnpm run build:native-system` and `pnpm --dir native/system run build:ts` before locking, so recovery works on such a checkout as well. This prevents overlapping proxy transactions across checkouts; other users and network-setting tools must not change these settings concurrently. SIGINT/SIGTERM wait for active work before restoration. After forced termination or a restoration error, stop any remaining notarization processes and run `pnpm --dir apps/desktop run restore:mac-proxy`; the saved record remains until restoration succeeds. Configuration checks validate URL syntax without changing system settings or contacting the proxy.

<a id="directory-and-preparation"></a>

## Directory builds and preparation

Create a runnable application directory instead of an installer by using the matching `:dir` command, such as:

```sh
pnpm run package:desktop:dir
pnpm run package:desktop:mac:arm64:dir
```

To inspect or troubleshoot the prepared host-target resources without invoking electron-builder, stop the same pipeline after preparation:

```sh
pnpm run prepare:desktop
```

This diagnostic command is an alternative stopping point, not the first half of a two-command build. A later `package:desktop*` command repeats the build selected by its signing mode and all preparation so it cannot consume stale dsh packages, runtime files, or dsh content.

<a id="local-official-bundles-from-a-loopback-registry"></a>

## Local Official bundles from a loopback registry

The test DMG excludes the provider runtimes the Official on-demand catalog advertises, and a release publishes matching bundle versions to npm. To install locally built bundles before that release, start a loopback registry that packs and serves the catalog's complete local dependency closure:

```sh
pnpm run dev:bundle-registry
```

The command validates the catalog and the workspace inventory, runs `pnpm run build:official`, packs the closure into a new `dist/test-bundles/<run-id>/` directory, writes `bundle-registry.json` last as the completion marker, and only then prints the artifact path, the registry URL, and the exact `name@version` specs. It serves `127.0.0.1` on an allocated port under a fresh namespace until Ctrl+C or SIGTERM, and stopping it leaves both the artifacts and the installed packages on disk. It needs no `.env.macos`, Apple credentials, or npm credentials, and it does not change `pnpm run package:desktop:unsigned`.

In the packaged application, open Plugins → Add plugin, paste one printed spec, choose **Custom address**, paste the printed registry URL, and install. A custom registry is asked alone, so this process must answer every dependency: repository-owned packages come from the run's own archives, and third-party packages keep npm's real metadata and bytes through a fixed redirect to `registry.npmjs.org`, which still requires network access. The installed entry stays Official because its package name is in the catalog. The registry choice is remembered in this browser; choose an offered registry again to switch back.

A run's artifacts are immutable, so a rebuild serves a new namespace and a new URL, and the Official **Update** control does not appear while the installed and running versions match. The profile records the previous run's tarball URL in `pnpm-lock.yaml`, and pnpm verifies recorded entries, so installing or reinstalling that bundle against a new URL is refused with `ERR_PNPM_TARBALL_URL_MISMATCH` and can leave the earlier files in place. To test changed code at the same version, clear the stale resolution first — `pnpm clean --lockfile` in `$DSH_HOME/profiles/<profile>`, or install into a fresh profile — then install again from the new URL. `bundle-registry.json` records each archive's version, filename, size, and SHA-512 integrity together with the packing checkout's commit and dirty flag.

The served `time` is the real packing time, so pnpm 11's default 24-hour `minimumReleaseAge` records the exemption it granted in the profile's `pnpm-workspace.yaml` (`minimumReleaseAgeExclude`); an explicitly stricter policy there fails the installation with pnpm's own message instead of being overridden. A `@scope:registry` route in `~/.npmrc` or the profile's `.npmrc` overrides `--registry` for that scope, so it must not route the served scope.

<a id="runtime-file-selection"></a>

## Runtime file selection and installation checks

Windows packaging rebuilds node-pty's patched ConPTY loader with the bundled Node headers before signing and inventory sealing. The build host needs Python, MSVC C++ tools and matching Spectre libraries; compilation failures stop packaging. The loader uses dynamically sized module paths and extended Windows paths, preserving the bundled console host. The payload smoke copies the shipped addon and console assets into a private path longer than 300 characters, including spaces and Chinese characters, and verifies terminal input, output and normal exit in a fresh process. This rebuild applies to Desktop artifacts; ordinary source installs retain npm's prebuild until explicitly rebuilt.

Before sealing the runtime, preparation writes `dsh/third-party-runtime.json` with the names, versions, declared licenses and notice-file hashes found in the materialized npm tree. Version-pinned supplemental texts from `LICENSES/npm/sources.json` are verified and copied into `dsh/licenses`; a changed or missing supplement aborts preparation. Exact-version entries in REA's bundled notice collection and README files containing recognized license-grant text are recorded as notice candidates. The reviewed Windows x64 Office engine `0.1.5` also records its five nested notice files; this selection does not apply to other versions. Blank files do not count as notice texts. Missing texts, incomplete reviewed collections and documented upstream gaps remain review-required. This inventory covers the dsh npm tree, not Electron, standalone Node/Python distributions or a legal compatibility determination; its presence is not release approval.

Desktop packs workspace packages locally and installs external dependencies through the target's bundled Node and pnpm. [Desktop's file policy](../scripts/runtime-file-policy.ts) then filters the immutable `resources/app.asar/dsh/node_modules` copy before signing and integrity sealing. It omits version-control .gitkeep placeholders, TypeScript declarations, recognized JavaScript/CSS/TypeScript source maps, TypeScript build caches, Domino's test directory and Yarn development metadata, selected native compiler outputs, and node-pty prebuilds for other platforms. Non-Windows targets also omit `node-pty/third_party/conpty`; Windows targets retain that directory. It preserves runtime JavaScript, target native modules and their DLL/EXE helpers, WASM, unknown assets, licenses, and notices. Dependency manifests pass through electron-builder's metadata cleanup before integrity sealing, so archiving preserves their recorded bytes. The policy does not alter npm tarballs, the bundled package manager, or user-installed plugin files.

The [Electron shell file list](../scripts/electron-builder-config.mjs) excludes recognized JavaScript/CSS/TypeScript source maps and TypeScript build caches from the separate `resources/app.asar/node_modules` dependency collection. These exclusions preserve runtime code, native modules, WASM, data files (including ordinary `.map` assets), licenses, and notices; [shell archive tests](../tests/shell-file-selection.spec.ts) check retained bytes and exclusions.

The [Office conversion provider](../../../packages/document/office-to-pdf/README.md) carries the target’s declared native engine, or WASM when the kit declares no matching native target. Preparation rejects a missing target engine before packaging. The complete Office dependencies, including CLI, JavaScript libraries, and the selected engine’s executables, data, licenses, and notices, are unpacked under `resources/app.asar.unpacked/dsh/node_modules/`. The Desktop Host resolves engine manifests to these physical directories and supplies loaded skills with absolute standalone Node and unpacked CLI paths. Node lives in `resources/runtime/primary-runtime/dependencies/node/bin/`; the CLI is the unpacked `@deepseek-ai/libreoffice-kit/lib/cli.js`. On macOS, the native helper receives the JIT entitlement required by [LibreOffice’s UNO bridge](https://github.com/LibreOffice/core/blob/master/sysui/desktop/macosx/hardened_runtime.xcent.in).

The packaged application runs compiled JavaScript and pre-generated Typert metadata; it does not compile TypeScript plugins. Source-level debugger navigation and editor declarations remain available in development packages. [Copy-policy tests](../tests/runtime-file-policy.spec.ts) cover exclusions and retained assets; The [payload smoke](../tests/fixtures/runtime-payload-smoke.mjs) runs under Electron RunAsNode before the Host smoke and final inventory verification. The payload smoke resolves the search tool’s ripgrep executable and verifies text search and file enumeration. Signed Windows builds run these checks after dependency signing; other builds run them during `prepare:dsh`. The [Host smoke](../scripts/smoke-runtime.ts) creates DOCX, XLSX, and PPTX inputs with bundled Python, converts each through the real Office provider, and checks PDF output. Every assembled application, including directory and unsigned builds, repeats the payload and Host checks against ASAR. Archive integrity checks compare the complete archived descriptor with preparation, file bytes and membership in both archive and unpacked trees, recorded executable flags for archived files, and physical permissions for unpacked files. The Host smoke also obtains CLI paths from the loaded skill and runs capabilities and DOCX conversion with an empty PATH. Conversion failures stop packaging before a release record is written; macOS DMG/ZIP builds run these checks before notarization.

Windows release qualification also runs [directory and replacement checks](../scripts/smoke-windows.ps1) manually after the Desktop build. Set `$Makensis`, `$SevenZip`, and `$PluginDir` to the pinned builder’s NSIS compiler, 7-Zip executable, and x86-unicode NSIS plugin directory; pass the prepared `window-frame.dll` as `-FrameLibrary` to exercise the native extraction path and its failure report as well. From the repository root, run the command below. It verifies directory replacement and rollback, and both locked-file replacement modes; it is not part of the unit-test lane.

```powershell
pwsh -NoProfile -File apps/desktop/scripts/smoke-windows.ps1 -Makensis $Makensis -SevenZip $SevenZip -PluginDir $PluginDir -FrameLibrary apps/desktop/.desktop-build/targets/win-x64/installer-ui/window-frame.dll
```

The Windows installer checks for a running application at startup and after destination selection, before extracting the new version beside the installation directory. It checks again before replacing directories through same-volume renames. A running application blocks installation; update launches allow up to ten seconds for it to exit. Same-path upgrades preserve the old directory until promotion succeeds; extraction failure leaves it intact, and promotion failure attempts to restore it. The installer removes the old backup before launch. Forced termination or power loss can leave `.new-*` or `.old-*` directories; installation-location and scope migrations retain electron-builder's old-uninstaller flow.

Directory renames, empty-destination removal, and restoration retry Windows errors 5, 32, and 33 up to ten attempts, with 250 ms increasing delays (11.25 seconds of total waiting per operation). Other errors stop immediately. A replacement failure reports the Windows error, affected paths, and restoration outcome in `directory-failure-<timestamp>.log` beside extraction reports. If restoration fails, the installer removes unlocked staging files and preserves the backup. After reporting that failure, exit cleanup does not retry restoration. Keep the backup path named in the report and contact support before reinstalling. Silent installs save the same diagnostic without a dialog.

When extraction fails, the installer writes a report with the 7-Zip result and its complete error output to the updater cache directory as `%LOCALAPPDATA%\<package-derived name>-updater\installer-logs\extract-failure-<timestamp>.log` (currently `deepseek-harness-uncensored-updater`) and shows the first error line with a **Copy error details** button; silent installs write only the report. Unsigned Windows builds (`DSH_DESKTOP_UNSIGNED=1`) name their installer `deepseek-harness-uncensored-<version>-win-x64-unsigned.exe` so they cannot be mistaken for release artifacts.

Windows packaging fixes the 7-Zip filter to `BCJ` for compatibility with the bundled NSIS decoder. This preserves ARM64 binaries carried by dependencies in x64 installers; automatic ARM64 filtering produces entries that this decoder cannot extract.

`DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL` in the Windows dotenv or machine preset selects installer archive compression from `0` to `9`. If omitted, the existing `ELECTRON_BUILDER_COMPRESSION_LEVEL` environment override remains effective, otherwise the default is `3` for both test and production. The manual Windows workflow's `compression_level` dropdown defaults to `3` and also offers `7`, matching the Mac ZIP choices; it overrides the file setting for that run. Direct local builds retain explicit machine settings. Mac ZIP workflow overrides must be `3` or `7`; an empty value is invalid even on macOS. Any defined Mac ZIP workflow override, including an empty value, rejects Windows; nonempty Windows workflow overrides reject macOS. Lower levels trade installer size for packaging time; qualify the complete signed workflow and artifact size before changing a release preset.

NSIS removes its temporary extraction tree during installation, before the completion page or an automatic launch. The installed production packages remain ordinary files; startup does not extract them again. Installation still writes the complete application tree.

<a id="desktop-runtime-preparation"></a>

## Desktop runtime preparation

The private Desktop Host includes the three forked experimental browser providers as runtime dependencies so their package overrides and proxy integration remain local to DSHU. Shipping these modules does not mount a provider or download Chromium; profiles select the provider and an installed browser.

Electron archives are verified against `checksums.json` from the exact locked Electron npm package. Valid cached archives require no GitHub checksum request; missing or malformed target checksums stop preparation, and corrupt cached files are rejected before extraction. A cache miss still requires downloading the archive.

Windows prepares Electron and primary-runtime concurrently; macOS prepares them serially. CLI preparation and `versions.json` publication require both payloads to succeed. If either Windows payload fails, preparation waits for the other to settle before reporting failure and publishes neither CLI resources nor versions. Nested preparation timings overlap and must not be added together.

`DSH_DESKTOP_PACKAGE_CACHE_DIR` in the packaging process environment selects a nonempty absolute directory for shared `downloads` and `pnpm-store` caches; omission uses `.desktop-build`. Temporary installation projects, lockfiles and configuration remain separate per run. Runtime installation verifies store integrity and copies package files so later signing cannot modify cached bytes; cleanup retains these caches. Both packaging workflows use `runner.tool_cache/dsh-desktop-package-cache`; Windows repository dependency installation uses a separate `.pnpm-store` at the workspace drive root. Both installation logs identify their store and report package reuse. Share writable caches only among trusted build jobs; integrity checks do not isolate untrusted writers. Clean caches only when no job is using them. Operators manage cache disk usage; no automatic eviction runs.

Desktop [patch policy](../scripts/runtime-patch-policy.ts) explicitly classifies every workspace patch as shared, workspace-only, or runtime-only. Shared entries reuse the root patch bytes and verify their hash against the root lockfile; runtime-only entries use separate repository files without changing workspace installation. Workspace-only patches belong to build tools or dependencies already embedded in client bundles. Unclassified or stale entries, missing files, changed hashes, incompatible resolved versions, and workspace-only packages entering the runtime stop packaging. The [preparation script](../scripts/prepare-runtime-patches.ts) writes only to the temporary project; pnpm applies the selected patches and rejects application failures.

Desktop dependency overrides are declared separately in the patch-policy module, not inferred from patch versions. The pi-ai constraint keeps its runtime version at the version qualified by the shared patch. The protected-terminal provider and `@microsoft/mxc-sdk@1.0.1` both use the qualified `node-pty@1.2.0-beta.15` patch; a second unpatched PTY version prevents packaging. CLI packed-installation tests and other distribution flows retain their own configuration.

The build-only project starts from the checked-in workspace lockfile. Before the frozen production install, [resolution verification](../scripts/prepare-runtime-lockfile.ts) requires registry versions and resolutions to match that captured lockfile and local core archives to match their recorded integrities. Optional first-party native variants omitted from this target are pinned to their source versions and must retain their excluding OS/CPU metadata; they are not shipped on this target. Unexpected versions, archives or resolutions stop preparation. Update the workspace dependencies and lockfile before an intentional dependency upgrade; the preparation process leaves those source files unchanged.

The runtime install keeps strict dependency-build approval. SSH uses its portable JavaScript implementation: `ssh2` and `cpu-features` explicitly decline their optional native build scripts, matching the workspace policy. Required PTY and Koffi build scripts remain enabled. External plugin profiles retain their own settings.

Every package command builds the repository, packs the first-party production closures rooted at dsh and the private Desktop Host, and prepares the target Electron distribution plus primary-runtime with its shared pnpm CLI. `prepare:dsh` installs the production graph once at build time, prepares materialized packages for electron-builder to archive under `app.asar/dsh`, removes package-manager metadata, and writes `desktop-runtime.json` with shared package versions and final file hashes. Signed macOS builds sign and verify native files before inventory generation; electron-builder excludes this already-signed tree from nested re-signing. Resource mappings explicitly include `dsh/node_modules`, which the default root-directory filter omits; the prepared runtime inventory is checked after native signing. Native executables and libraries are unpacked beside ASAR; Python, standalone Node and pnpm remain in external runtime resources. Windows packaging checks every prepared PE against its ASAR unpacked entry and byte-identical disk copy, including unsigned builds. Builder glob rules match braces in PE filenames as single-character wildcards, so a matching neighboring file may also be unpacked. Prepared runtime smoke uses the verified target descriptor rather than the build host architecture. Signed installer, notarization, installed upgrade, and target-specific native-module qualification require the release environment.

Windows runtime sealing reads at most eight files concurrently, before and after native signing. A read failure drains outstanding reads without replacing the descriptor; successful sealing still requires the subsequent complete integrity and smoke checks.

Signed macOS packaging writes `Contents/Resources/app-update.yml` while assembling the App and before code signing, including the directory build that feeds the parallel ZIP and DMG lanes. The signing hook verifies the exact feed and updater cache directory. Both lane copies and the promoted App are checked again before the release completion record is written; a missing or mismatched configuration prevents artifact promotion and therefore prevents upload.

An unpacked artifact contains Electron, the materialized dsh production tree, pnpm, and the shell application. Installer size and filesystem size differ; release qualification measures both, plus the profile’s plugin storage and first-launch latency. The runtime trades more application files for eliminating core package installation on the user’s machine.

Windows packaged-runtime verification runs a private copy of the assembled application under a short temporary path. Native Python and Office loaders can reject long build paths, including junctions that resolve to those paths. Archive integrity, native imports, Host startup and document conversion checks still run in full; the copy is removed after child processes finish.

macOS artifact preparation and retained-package checks use `DeepSeek Harness Uncensored.app`, the `deepseek-harness-uncensored-` archive prefix and the DSHU GitHub release feed.

Unsigned local packing verifies the source commit, product metadata, build profile and artifact hashes against the complete build record. It uses the compile time stored in that record; starting a later packaging process does not generate a new compile time.

<a id="verification"></a>

## Installation and release verification

Windows lists the installed application by product name without a version suffix; the version remains in the separate version field. Desktop's `package.json` `author.name` supplies the installer publisher and executable company name, independently of the signing certificate. Windows and macOS retain product-name copyright text. Installation or upgrade with a rebuilt installer applies the new metadata; existing installations retain their previous values until then.

Keep the generated installer, its version and packaging records together. Review signatures and runtime checks before installation, then follow the [installed-update qualification procedure](../tests/installed-update/README.md) for installed launch and upgrade evidence. The [Desktop test record](../tests/README.md) owns verification limits; a successful workflow alone does not establish production preset, new-workstation or installed-upgrade acceptance.

## Dev Note

XXX: Evaluate disk-space monitoring, a maintenance entry point and automatic eviction if disk shortages, sustained cache growth or frequent manual cleanup occur. Any automated cleanup would need coordination with every cache user.
