---
description: "在本地生成 DSHU Desktop 安装包，选择部署与签名模式，并获取产物和诊断。本指南区分构建操作、发布与已安装应用验收。使用硬件凭据前，必须检查平台签名要求与共享 runner 风险。"
---

# Desktop 打包

[English](README.md) | 中文

## 概述

在本地生成 DSHU Desktop 安装包，选择部署与签名模式，并获取产物和诊断。本指南区分构建操作、发布与已安装应用验收。使用硬件凭据前，必须检查平台签名要求与共享 runner 风险。

## 目录

- [选择打包方式](#choose-a-build)
- [发布版本](#release-versions)
- [配置与本地构建](#configuration-and-local-builds)
- [Windows Actions 打包](#windows-actions)
- [macOS 自托管打包](#macos-actions)
- [未签名 Windows 测试安装包](#unsigned-windows-test-installer)
- [无发布签名的本地 macOS DMG](#local-macos-dmg-without-release-signing)
- [Linux x64 检查包](#linux-x64-inspection-packages)
- [macOS 发布签名与诊断](#macos-release-signing)
- [目录构建与准备](#directory-and-preparation)
- [用回环 registry 安装本地 Official 包](#local-official-bundles-from-a-loopback-registry)
- [运行时文件筛选与安装检查](#runtime-file-selection)
- [Desktop 运行时准备](#desktop-runtime-preparation)
- [安装与发布验收](#verification)

<a id="choose-a-build"></a>

## 选择打包方式

安装锁定依赖后，从仓库根目录运行本地命令。使用对应平台的本地命令；当前仓库没有启用打包工作流。test/production 部署与 signed/unsigned 模式分别选择。任何 Windows 签名构建或共享 runner 使用前，先阅读 [Windows 签名与 runner 运维](../windows-signing/README.zh.md#trust-and-isolation)。安装与打包分开进行；[发布](../publishing/README.zh.md)还需要单独的显式操作。

将 `DSH_DESKTOP_PACKAGE_CACHE_DIR` 设为绝对构建缓存目录以跨 checkout 复用；详见[缓存配置与生命周期](#desktop-runtime-preparation)。

<a id="release-versions"></a>

## 发布版本

使用 `apps/desktop/package.json` 中独立的 DSHU 产品版本；根包版本标识 DSH 内核，不决定安装器版本。已有授权范围内的本地打包无需重复确认版本。公开发布需要对应的发布授权，并核对 GitHub 已有标签与资产中的版本。

不传 `--build-version` 时保留 DSHU 产品版本。编号测试包保留预发布产品版本并追加 `.YYYYMMDD.index`；稳定产品版本追加 `-test.YYYYMMDD.index`。不会改写已跟踪的清单。

| DSHU 产品版本 | 无编号 Desktop | 编号测试包示例 |
|---|---|---|
| `0.1.0` | `0.1.0` | `0.1.0-test.20261103.1` |
| `0.2.0-alpha.1` | `0.2.0-alpha.1` | `0.2.0-alpha.1.20261103.1` |

`--build-version auto` 使用构建机本地日期，从本目标的 DSHU 本地产物（包含保留的 run 目录）取得下一个序号，忽略官方 DSH 文件名且不访问远端存储。保留的 CI 版本格式化器使用 UTC 日期、工作流运行编号和尝试次数；当前仓库没有工作流调用它。两种方式都不预留公开版本。

```sh
pnpm --dir apps/desktop run package:win:x64:unsigned --build-version auto
```

打包不会上传或创建发行标签。旧云发布入口在读取配置或凭据前返回退出码 1，详见[迁移说明](../publishing/README.zh.md)。经核对的产物另行通过本仓库 GitHub Releases 发布；每份产物记录 `dshBuildCommit` 与 `dshBuildDirty`。

DSHU 签名包使用 GitHub 的 `latest` 发行渠道；未签名检查包不包含自动安装更新源。`-test.<date>.<sequence>` 版本低于对应稳定基准，不能自动升级已安装的更高版本。自动降级保持关闭，自动分发修复版需提升产品版本。见[发行自动化状态](../publishing/ci/README.zh.md)。

<a id="configuration-and-local-builds"></a>

## 配置与本地构建

DSHU 安装包始终保留 HARNESS / UNCENSORED 品牌，不随签名状态或构建渠道改变。应用和安装器名称均为 DeepSeek Harness Uncensored。未签名包仍未签名，品牌不代表官方 DSH 发行或已验证签名。

本地 Windows 命令通过 `DSH_PACKAGING_CONFIG_DIR` 指定机器配置绝对目录，通过 `DSH_PACKAGING_PRESET` 选择 `test` 或 `production`。加载器读取 `presets/<preset>.env`；签名命令另读 `secrets/windows-signing.env`。相对证书和 SignTool 路径以声明它们的文件所在目录为基准。公开 preset 拒绝凭据，签名文件不能覆盖公开配置。配置缺失立即失败，不回退到 `.env.windows`；不选择 preset 的命令保留原 dotenv 行为。未签名和仅准备 preset 不读取签名文件。缓存维护也只读取公开 preset 配置。DSHU 签名包使用本仓库的 GitHub 更新源。本地 preset 命令使用 `--build-version auto` 时仅按本地产物编号；保留的 CI 格式化器使用运行编号和重试次数。


不选择机器 preset 时，打包以及手动 macOS 签名检查（本地 macOS 未签名构建除外）使用 `apps/desktop/.env.windows` 或 `.env.macos`，由目标平台选择。复制对应的 [Windows 模板](../.env.windows.example) 或 [macOS 模板](../.env.macos.example)，填写本机配置；Git 忽略这两个本地文件，安装产物也不包含它们。发布字段只从选定的配置文件读取，不回退到系统或 shell 中的同名变量；`PATH`、代理和构建工具环境仍保留。发布版本是命令参数而非发布字段，上传从打包写下的完成记录中读取它。文件使用 UTF-8，支持 BOM；相对证书、SignTool、Apple API Key 和钥匙串路径以 `apps/desktop` 为基准，变量值不做 shell 展开，包含 `#` 或空格的密码需要引号。Windows CI 读取相同的机器 preset。

每条打包命令在构建与下载前检查应用 ID 以及该模式需要的更新与签名配置，随后探测本次运行要用的外部工具：归档读取工具，以及 Windows 目标的安装器编译器。macOS 检查身份、Team ID、一套完整公证凭据、`CSC_LINK` 指定的可读本地 p12 文件、显式配置的 `CSC_KEY_PASSWORD`，以及引用的 API Key 和钥匙串文件；Windows 检查公开代码签名证书、SignTool 文件、容器名称和 PIN 格式。仅准备 Windows 资源以及两个平台上的显式未签名打包均不要求签名凭据。配置检查不验证 PIN 是否正确、Token 是否登录、钥匙串是否解锁或 Apple 是否接受凭据；实际签名与公证负责这些检查。普通构建与 `--check` 的自动编号都只读取本地。单独运行相同检查：

```sh
pnpm --dir apps/desktop run check:package
```

无需提前执行 `prepare:desktop`：

```sh
pnpm run package:desktop
```

发布自动化使用固定目标命令，确保运行时准备、dsh 准备与 electron-builder 接收相同的平台和架构：

```sh
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:mac:x64
pnpm run package:desktop:win:x64
```

macOS arm64 命令要求 Apple Silicon。macOS x64 命令可以在 Intel macOS 或带 Rosetta 的 Apple Silicon 上运行。Windows x64 命令要求 Windows x64。Linux x64 使用下方独立的未签名检查流程；支持打包不代表通过发行验收。

macOS 正式发布和本地未签名 DMG 都通过 [electron-builder 配置](../scripts/electron-builder-config.mjs)中的 `dmg.format: 'ULMO'` 使用 LZMA 压缩。[构建时补丁](../../../patches/app-builder-lib@26.17.0.patch)为固定版本 builder 的校验规则和 TypeScript 声明添加此格式。

每个目标都在 `apps/desktop/.desktop-build/targets/<target>/` 下持有自己的打包输入、已准备运行时、包集合、dsh 依赖树、pnpm 准备状态、未打包应用、更新元数据和最终产物。Electron 归档缓存继续由 `.desktop-build/downloads` 共享，因为每个归档文件名都包含版本、平台和架构，并且在解包前经过验证。目标构建绝不读取其他目标的可变准备状态。

<a id="windows-actions"></a>

## Windows Actions 打包

当前仓库没有启用 Windows 打包工作流。使用下方本地未签名命令，不要沿用上游 Actions 链接或期待 CI 保留产物。后续 DSHU 工作流须保持独立产品身份，并只向 DSHU 仓库发布。见[自动化状态](../publishing/ci/README.zh.md)。

<a id="macos-actions"></a>

## macOS 自托管打包

当前仓库没有启用 macOS 打包工作流，也不承诺已注册的 runner。下方本地 macOS 命令仍可使用。按[签名说明](#macos-release-signing)在 Mac 构建机配置签名和公证；Windows 构建不能验证 macOS 交付。

<a id="unsigned-windows-test-installer"></a>

## 未签名 Windows 测试安装包

在 Windows x64 上，使用完整的未签名打包命令进行本地安装测试：

```sh
pnpm run package:desktop:win:x64:unsigned
```

该命令读取 `.env.windows`，要求设置 `DSH_DESKTOP_APP_ID` 和[强制更新策略配置](../README.zh.md#mandatory-update-policy)，包括真实的 HTTPS 服务 origin。本机验收和 CI 使用 Node 24；其他工具为根 `packageManager` 固定版本的 pnpm、Git、PowerShell 7（`pwsh`）、tar、Python、Visual C++ Build Tools 和 Windows SDK。Python 不在 `PATH` 中时设置 `PYTHON`。命令将安装包写入 `.desktop-build/targets/win-x64/unsigned-artifacts/`，省略普通自动更新配置，清除签名凭据，且不生成发布完成记录。无需 EV 或上传凭据。签名打包和上传仍遵循正式发布要求。

先运行 `pnpm install --frozen-lockfile`，再运行 `pnpm run package:desktop:win:x64:unsigned --check` 校验配置和工具，最后执行上面的完整命令。打包自行执行完整构建和隔离的运行时 smoke，不调用在线模型。阶段日志保留在 `.desktop-build/packaging-runs/`；仅构建成功不代表安装包验证通过。依赖安装和运行时准备需要访问 npm、GitHub release 资源和 nodejs.org；网络需要时使用现有 registry 和代理配置。缓存与工具位置属于构建机器配置，不在跟踪文件中固定个人路径。

<a id="local-macos-dmg-without-release-signing"></a>

## 无发布签名的本地 macOS DMG

执行 `pnpm install` 后，在仓库根目录运行一条命令即可，无需 `.env.macos`、Apple 账号、证书或更新服务配置：

```sh
pnpm run package:desktop:mac:arm64:unsigned
pnpm run package:desktop:mac:x64:unsigned
```

添加 `--check` 仅验证本地配置和工具而不构建，或添加 `--dir` 只生成解包应用。DMG 路径为 `apps/desktop/.desktop-build/targets/<target>/unsigned-artifacts/runs/<run-id>/deepseek-harness-uncensored-<version>-mac-<arch>-unsigned.dmg`。所有检查通过后，命令打印 `DMG:` 及其绝对路径。打开后将应用复制到本地测试目录。

这些命令忽略 `.env.macos` 和继承的发布配置，使用 `com.deepseek.dsh.uncensored` 作为应用 ID，并省略自动更新和强制更新配置。构建工具、标准网络代理与 `DSH_DESKTOP_NPM_REGISTRY` 仍可从 shell 提供。它们跳过 Developer ID 签名、Apple 公证、临时签名钥匙串和公证代理修改。Electron 使用无需证书的本地 ad-hoc 签名，以便修改后的可执行文件能够运行；DMG 不签名。准备阶段和组装后的应用仍执行运行时完整性与冒烟检查。本地构建不生成更新源、ZIP 或发布完成记录，上传命令无法发布这些产物。macOS 可能要求在“系统设置 → 隐私与安全性”中批准打开未经公证的应用。

<a id="linux-x64-inspection-packages"></a>

## Linux x64 检查包

在 Linux x64 上构建，准备 Node 24、锁定版本的 pnpm、Git、tar、C 编译器和 musl 开发工具（Ubuntu 的 `build-essential` 与 `musl-tools`）。Electron 还需要发行版的桌面库。预检检查 `cc` 和 `musl-gcc`，构建在组装运行时前编译并打包本地 Linux 原生组件。

```sh
pnpm run package:desktop:linux:x64:unsigned --check
pnpm run package:desktop:linux:x64:unsigned --build-version auto
```

命令在 `apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/runs/<run-id>/` 生成 deb 和 tar.gz。追加 `--dir` 时停在 `linux-unpacked`。可执行文件和桌面入口使用 `deepseek-harness-uncensored`；运行时、CLI 和资料身份与官方 DSH 分开。目录 smoke 检查打包运行时，不代表安装、桌面集成、升级和移除通过。

便携启动时，将完整的 tar.gz 解压到有权限的目录，再进入解压后的应用目录运行 `./deepseek-harness-uncensored`。将 `resources/` 保留在可执行文件旁。启动后使用独立的 DSHU 配置和资料。

通过发行版的包管理器安装 deb，以便解析桌面运行库。deb 声明 ALSA 和 GBM，并兼容 time64 迁移前后的 ALSA 包名。Debian 将包版本的 `~test` 后缀排在对应稳定版本之前。Debian 12 验收通过 APT 安装旧版 deb、原位升级并彻底卸载新版，保留了测试用户的资料文件。

Linux 未签名构建无需 dotenv 文件，并忽略继承的发布凭据。保留标准网络代理、构建工具变量、`DSH_DESKTOP_NPM_REGISTRY` 和 `DSH_DESKTOP_LINUX_PACK_CONCURRENCY`；并发数为正整数，默认四个 worker。构建省略更新源与发布记录，不上传产物。可选的 [Linux 模板](../.env.linux.example) 用于配置式打包，不由此本地检查命令读取。

<a id="macos-release-signing"></a>

## macOS 发布签名与诊断

macOS 签名配置使用必填发布环境，不会接受钥匙串中最先发现的证书。空值、格式错误的 Team ID、包含 electron-builder 不支持的 `Developer ID Application:` 前缀的签名身份，以及不完整的公证凭据都会被拒绝。macOS 签名打包要求已配置的身份及其私钥可用。运行时准备会把该身份、安全时间戳与 hardened runtime 应用到每个内嵌 Mach-O 文件；应用签名完成后，深度严格检查会拒绝其他叶证书 Authority 或 Team ID，验证通过才生成发布产物。macOS 签名固定目标安装包命令为已签名应用创建独立副本，并发执行两条产物流。一路先公证 App 并钉票，再生成 ZIP 及其更新元数据。另一路把已签名 App 副本封装进签名 DMG，再公证 DMG、钉票并验证；其中的 App 不单独附加票据。只有两路均成功结束，产物才会移入最终目录并写入发布完成记录。签名的仅目录命令同样需要公证凭据，并等待 Apple 公证和 App 钉票完成。[并行公证决策](../../../.agents/notes/implemented/process/2026-09-09-parallel-macos-notarization.zh.md)负责副本隔离与容器票据语义。`CSC_LINK` 必须指向包含 Developer ID Application 证书及私钥的本地 p12，不支持 URL 或 Base64 输入。`CSC_KEY_PASSWORD` 是其导出密码，不是 Apple 账号或登录密码；未加密的 p12 可显式填写空值。构建前，打包流程自动创建并解锁私有临时钥匙串、导入 p12、授权签名并签署小型探针。运行时与 App 签名显式使用该钥匙串，无需预先配置或手动解锁登录钥匙串。子进程只接收钥匙串路径，不接收 p12 密码。成功或普通失败后删除临时钥匙串；强制终止后由 CI 清理临时凭据。临时 CI 从密钥存储生成证书文件和 `.env.macos`，限制文件访问权限，并在作业结束后删除二者；自托管机器 preset 在 checkout 外保留私有文件。环境中的 `CSC_NAME` 与证书发现顺序都不能选择发布所有者。公证凭据也可以使用 electron-builder 支持的完整 Apple ID 或钥匙串 profile 方式。手动执行 `pnpm --dir apps/desktop run verify:mac-signature -- <path-to-app>` 重复应用检查时，也必须提供两个 macOS 身份变量。

macOS 签名遍历真实文件，不跟随 Framework 的软链接别名。PAK 资源保留全部随附语言，由外层 Framework 或应用签名记录完整性，不逐个签名。[发布策略](../../../.agents/notes/implemented/architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md)负责依赖补丁和验证要求。

macOS 运行时准备将已验证的单架构 Mach-O 签名缓存在 `.desktop-build/targets/<target>/signature-cache`，除非通过 `DSH_DESKTOP_MACOS_SIGNATURE_CACHE_DIR` 选择外置存储。显式路径必须是已存在的绝对目录，祖先路径不能包含链接，目录须归当前账户所有、权限为 `0700` 且可读写及遍历；非法或空配置在预检时失败，不回退。省略该字段保留目标本地缓存。缓存键包含输入字节与权限、签名探针实际使用的叶证书、签名标识、entitlement 字节、macOS 版本，以及签名工具与策略。复用不取决于 Git 提交：未提交的字节变更会使对应文件失效。每次命中都验证缓存字节、严格签名、证书、标识、entitlements、安全时间戳和 hardened runtime，再替换未被并发修改的输入。通用二进制每次重新签名。运行时完整性与 smoke 检查、App 签名和 Apple 公证仍会执行。缓存要求受信任的本地构建存储。缓存损坏或不安全链接会令构建失败；停止打包后删除对应缓存目录再重试。成功的签名阶段会将完整缓存条目的内容总量裁剪至一 GiB；中断留下的临时条目需手动清理。并发淘汰可能使读取方安全失败。日志记录命中、未命中及未缓存数量。

Mac 打包命令通过 `DESKTOP_PACKAGING_RECORD` 输出 `apps/desktop/.desktop-build/packaging-runs/` 下的唯一目录。读取本地配置后，每次运行保留 `run.json`（发布版本、产品版本、Git 提交、工作区是否有改动、目标及 Node 版本）、`events.jsonl`（带时间戳的阶段、耗时、并行输出归属及代理恢复状态）、脱敏后的子进程 `stdout.log` / `stderr.log`，以及 `result.json`（整体结果、阶段结果和产物目录）。事件还记录打包并发数及各代理是否配置。失败和后续打包不会清除日志；没有自动删除流程。缺少 `result.json` 表示完成状态未经确认。已知凭据值会被遮盖；不记录环境变量全集或 notarytool 认证参数。运行时准备分别记录包暂存、安装、依赖树复制、签名、清单生成、smoke 检查、描述文件校验和清理。嵌套阶段的耗时存在重叠，不能直接相加。

App 和 DMG 公证分别记录 submission ID，以及独立的 `notarytool:upload:*` 和 `notarytool:wait:*` 耗时。上传使用 `submit --no-wait`，包含认证、本地校验、传输和服务端受理，并非纯传输时间。等待从该命令返回后开始，包含轮询及剩余的 Apple 处理时间；Apple 可能在上传提交命令返回前已开始处理。日志保留 Apple 状态与诊断信息，包括拒绝结果；签名检查、接受状态校验和 stapling 仍由 `@electron/notarize` 负责。仅生成目录的打包命令也使用同一条可计时的 App 公证路径。各子进程输出仍实时显示在终端，阶段失败及嵌套错误保留在事件日志中。两个平台均记录父进程打包失败，并在终端显示脱敏诊断，包括代理恢复操作指引。仅检查配置的 `check:package` 命令不创建运行日志。

Mac 打包从 `.env.macos` 读取以下调优字段：

| 设置 | 默认值 | 作用范围 |
|---|---|---|
| `DSH_DESKTOP_MACOS_PACK_CONCURRENCY` | `4` | 第一方与 vendor workspace tarball 的打包 worker 数；必须是正整数。 |
| `DSH_DESKTOP_MACOS_ZIP_COMPRESSION_LEVEL` | `3` | 最终更新 ZIP 的压缩等级，整数 `0`–`9`；较低等级以更大的下载体积换取更短的构建时间。App 公证归档和 DMG 压缩不变。 |
| `DSH_DESKTOP_MACOS_DOWNLOAD_PROXY` | 空 | Electron、运行时资源、pnpm 安装及 builder 下载使用的 HTTP/HTTPS 代理 origin。 |
| `DSH_DESKTOP_MACOS_NOTARIZATION_PROXY` | 空 | 通过临时系统代理设置供 Apple 工具使用的 HTTP 代理 origin。 |

两个代理字段互相独立，拒绝 URL 中的凭证、路径、查询参数和片段。空值沿用继承的网络设置。显式下载代理会替换子进程的代理变量，仅绕过本地主机；它不修改系统设置。公司代理地址仅写入 Git 忽略的本地文件；具体地址参见内部文档。

Apple 工具使用 macOS 当前活动网络服务的 HTTP/HTTPS 代理。配置公证代理后，打包会检查代理可达性、保存该服务的设置，在两条产物任务期间启用代理，并在两条任务均结束后恢复原设置。对于原本关闭、服务器为空且端口为零的代理，恢复时仅关闭代理；临时服务器和端口可能保留，但不生效。仅生成目录的打包会在签名目录构建完成后的 App 公证期间启用代理。这会临时影响其他应用，并要求修改系统代理的权限；必须先禁用 PAC、自动发现、SOCKS 及需要认证的代理配置。打包和恢复在读取恢复记录或修改代理前获取同一个用户级 POSIX 文件锁；进程退出会释放锁的持有权，锁文件保留。该锁在首次使用时才加载 `@deepseek-ai/node-addon-system/flock`，而不是在脚本启动时加载，因此 `check:package` 和打包入口在未构建 `native/system` 的 checkout 上也能加载；加锁时若宿主 addon 二进制或入口的 JavaScript 缺失，加载器会先运行 `pnpm run build:native-system` 和 `pnpm --dir native/system run build:ts` 再加锁，因此恢复命令在这样的 checkout 上同样可用。这会阻止不同 checkout 的代理事务重叠；其他用户及网络设置工具不得同时修改这些设置。SIGINT/SIGTERM 会等待活动任务结束后恢复。强制终止或恢复失败后，先停止残留公证进程，再运行 `pnpm --dir apps/desktop run restore:mac-proxy`；保存的记录会保留到恢复成功。配置检查仅验证 URL 语法，不修改系统设置或连接代理。

<a id="directory-and-preparation"></a>

## 目录构建与准备

使用对应的 `:dir` 命令可以生成可直接运行的应用目录，而不是安装包，例如：

```sh
pnpm run package:desktop:dir
pnpm run package:desktop:mac:arm64:dir
```

需要检查或诊断为宿主目标准备的资源而不调用 electron-builder 时，可以让同一流水线在准备完成后停止：

```sh
pnpm run prepare:desktop
```

这条诊断命令是另一种停止位置，并非两条命令构建流程的前半段。之后执行 `package:desktop*` 时仍会重新完成按签名模式选择的构建与全部准备，避免使用陈旧的 dsh 包、运行时文件或 dsh 内容。

<a id="local-official-bundles-from-a-loopback-registry"></a>

## 用回环 registry 安装本地 Official 包

测试 DMG 不包含 Official 按需目录所宣传的 provider 运行时，而正式发布才会把对应版本的 bundle 发到 npm。要在发布前安装本地构建的 bundle，请启动一个回环 registry，它会打包并提供该目录的完整本地依赖闭包：

```sh
pnpm run dev:bundle-registry
```

该命令先校验目录与 workspace 清单，运行 `pnpm run build:official`，把闭包打包进新的 `dist/test-bundles/<run-id>/` 目录，最后写入 `bundle-registry.json` 作为完成标记，然后才打印产物路径、registry URL 和精确的 `name@version` 规格。它在分配到的端口上只监听 `127.0.0.1`，使用一次性的命名空间提供服务，直到 Ctrl+C 或 SIGTERM；停止后产物和已安装的包都保留在磁盘上。它不需要 `.env.macos`、Apple 凭据或 npm 凭据，也不改变 `pnpm run package:desktop:unsigned`。

在打包应用中打开“插件 → 添加插件”，粘贴一条打印出的规格，选择**自定义地址**，粘贴打印出的 registry URL 后安装。自定义 registry 会被单独询问，因此必须由本进程回答每一个依赖：仓库自有的包取自本次运行的产物，第三方包则通过固定重定向到 `registry.npmjs.org` 保留 npm 的真实元数据与字节，因此仍需要网络访问。安装后的条目仍归类为 Official，因为它的包名在目录中。registry 选择会在此浏览器中记住；再次选择某个提供的 registry 即可切回。

一次运行的产物是不可变的，所以重新构建会提供新的命名空间和新 URL；当已安装版本与运行版本一致时，Official 的**更新**控件不会出现。profile 会在 `pnpm-lock.yaml` 中记录上一次运行的 tarball URL，而 pnpm 会校验已记录的条目，因此用新 URL 再次安装或重装该 bundle 会被 `ERR_PNPM_TARBALL_URL_MISMATCH` 拒绝，并且可能继续保留旧文件。要在同一版本上验证改动后的代码，请先清除过期的解析结果——在 `$DSH_HOME/profiles/<profile>` 中运行 `pnpm clean --lockfile`，或改用全新的 profile——然后再从新 URL 安装。`bundle-registry.json` 记录每个归档的版本、文件名、大小和 SHA-512 完整性，以及打包所用 checkout 的 commit 和 dirty 标记。

所提供的 `time` 是真实的打包时间，因此 pnpm 11 默认的 24 小时 `minimumReleaseAge` 会在 profile 的 `pnpm-workspace.yaml` 中记录它授予的豁免（`minimumReleaseAgeExclude`）；如果那里显式配置了更严格的策略，安装会以 pnpm 自己的报错失败，而不会被覆盖。`~/.npmrc` 或 profile 的 `.npmrc` 中的 `@scope:registry` 路由会覆盖该 scope 的 `--registry`，因此不能让它们指向正在提供服务的 scope。

<a id="runtime-file-selection"></a>

## 运行时文件筛选与安装检查

Windows 打包在签名和清单封装前，使用捆绑 Node 的头文件重新编译已修补的 node-pty ConPTY 加载器。构建机需要 Python、MSVC C++ 工具及对应的 Spectre 库；编译失败会中止打包。加载器使用动态长度模块路径和 Windows 扩展路径，继续使用随包控制台宿主。载荷检查将实际分发的 addon 和控制台资源复制到超过 300 字符、包含空格与中文的私有路径，在新进程中验证终端输入、输出及正常退出。此重编译针对 Desktop 产物；普通源码安装仍使用 npm 预构建文件，直到显式重编译。

Windows 前置检查和 `--check` 先用 `vswhere` 定位 Visual Studio，再在打包环境中执行启用 Spectre 的 MSBuild x64 准备检查。临时项目在成功和失败后都会清理。所选工具集缺少库或 SDK 时，在仓库构建和下载前停止并显示原始 MSBuild 诊断。目录包和仅准备运行时同样需要此检查，因为它们也编译 ConPTY。可通过 `VCToolsVersion` 选择已完整安装的工具集，Preview 另设 `MSVCPreviewEnabled=true`，或按 [Microsoft 的 MSB8040 说明](https://learn.microsoft.com/en-us/visualstudio/msbuild/errors/msb8040)补装匹配组件。检查不改动系统工具集设置，也不替代完整原生编译。

准备阶段在完整性封装前生成 `dsh/third-party-runtime.json`，记录物化 npm 树中的包名、版本、声明许可证和声明文件摘要。`LICENSES/npm/sources.json` 中按版本固定的原文经校验后复制到 `dsh/licenses`。补充原文缺失或摘要不符会中止准备。清单将 REA 集中声明中的精确版本条目，以及含已识别许可授权文字的 README 记为声明候选文件。Windows x64 Office 引擎 `0.1.5` 另记录五份嵌套声明。原文缺失、空白、声明不齐全或存在已知上游缺项时保留待核查标记。Fontkit 2.0.4 以及 Linux x64 的 libvips 与 Sherpa-ONNX 在内嵌数据或组件核查期间保留该标记。

独立的 `runtime/primary-runtime/third-party-runtime.json` 清点 Node、Python 与 pnpm，记录嵌套声明及每个已安装 Python 包的元数据、声明文件和摘要。[共享运行时构建器](../../../packages/skill/tool-workspace-dependencies/README.zh.md#use-this-package)会拒绝缺失或版本不符的已声明发行包。清单不代表许可兼容性或全部内嵌组件署名已核清。Electron 和安装器声明另行审查。

Desktop 在本地打包工作区包，并通过目标捆绑的 Node 和 pnpm 安装外部依赖。[Desktop 文件策略](../scripts/runtime-file-policy.ts)随后在签名和完整性封装前过滤不可变的 `resources/app.asar/dsh/node_modules` 副本。它排除版本控制 .gitkeep 占位文件、TypeScript 声明、已识别的 JavaScript/CSS/TypeScript source map、TypeScript 构建缓存、Domino 测试目录及 Yarn 开发元数据、选定的原生编译器输出和其他平台的 node-pty 预构建文件。非 Windows 目标还会排除 `node-pty/third_party/conpty`；Windows 目标保留该目录。它保留运行时 JavaScript、目标平台的原生模块及其 DLL/EXE 辅助文件、WASM、未知资源、许可证和 notices。依赖清单在完整性封装前经过 electron-builder 的元数据清理，确保归档保持已记录的字节。该策略不修改 npm tarball、捆绑的包管理器或用户安装的插件文件。

[Electron 外壳文件清单](../scripts/electron-builder-config.mjs)从单独收集的 `resources/app.asar/node_modules` 依赖中排除已识别的 JavaScript/CSS/TypeScript source map 和 TypeScript 构建缓存。这些排除规则保留运行时代码、原生模块、WASM、数据文件（包括普通 `.map` 资源）、许可证和 notices；[外壳归档测试](../tests/shell-file-selection.spec.ts)检查保留文件的字节和排除项。

Windows 与 Linux 打包后的检查将 `LICENSE.electron.txt` 和 `LICENSES.chromium.html` 与准备好的 Electron 分发包原文逐字比对，并要求原文非空。Windows 安装器暂存所用 NSIS 编译工具集的 `COPYING` 和两份 7-Zip 声明，核验固定版本的 StdUtils 和 UAC DLL，并携带对应的 `StdUtils-1.14-sources.tbz2` 与 `UAC-0.2.4c-LICENSE.txt`。快捷方式身份、取消固定和跳转列表清理由 Windows Shell API 处理。[安装升级检查器](../tests/installed-update/README.zh.md)拒绝残留的 WinShell DLL，再将外层 NSIS 条目与暂存输入比对并解出内层应用。

[Office 转换提供方](../../../packages/document/office-to-pdf/README.zh.md)携带目标已声明的原生引擎；kit 未声明匹配原生目标时携带 WASM 引擎。准备阶段在打包前拒绝缺少目标引擎的情况。完整 Office 依赖（CLI、JavaScript 库和选定引擎的可执行文件、数据、许可证及 notices）解包到 `resources/app.asar.unpacked/dsh/node_modules/` 下。Desktop Host 将引擎清单解析到这些物理目录，并向加载的技能提供独立 Node 和解包后 CLI 的绝对路径。Node 位于 `resources/runtime/primary-runtime/dependencies/node/bin/`；CLI 位于解包后的 `@deepseek-ai/libreoffice-kit/lib/cli.js`。macOS 上的原生辅助程序获得 [LibreOffice UNO 桥](https://github.com/LibreOffice/core/blob/master/sysui/desktop/macosx/hardened_runtime.xcent.in)所需的 JIT entitlement。

打包应用运行编译后的 JavaScript 和预生成的 Typert 元数据，不编译 TypeScript 插件。源码级调试导航和编辑器声明仍可从开发包中获取。[复制规则测试](../tests/runtime-file-policy.spec.ts)覆盖排除项和保留资源；[产物 smoke](../tests/fixtures/runtime-payload-smoke.mjs) 在 Host smoke 和最终清单验证之前，使用 Electron RunAsNode 执行。产物 smoke 解析搜索工具使用的 ripgrep 可执行文件，并验证文本搜索和文件枚举。Windows 签名构建在依赖签名后运行这些检查；其他构建在 `prepare:dsh` 中运行。[Host smoke](../scripts/smoke-runtime.ts) 使用捆绑的 Python 创建 DOCX、XLSX 和 PPTX 输入，通过真实 Office 提供方逐一转换并检查 PDF 输出。每个组装后的应用（包括目录包和未签名构建）都会针对 ASAR 重复产物和 Host 检查。归档完整性检查将归档内完整描述符与准备结果比对，并核对归档和解包目录中的文件内容与清单、归档内文件记录的执行标志，以及解包文件的物理权限。转换失败会在写入发布记录前终止打包；macOS DMG/ZIP 构建在公证前执行这些检查。

Windows 发布验收还需在 Desktop 构建后手动运行[目录和替换检查](../scripts/smoke-windows.ps1)。将 `$Makensis`、`$SevenZip` 和 `$PluginDir` 分别设为锁定版本构建器的 NSIS 编译器、7-Zip 可执行文件和 x86-unicode NSIS 插件目录；通过 `-FrameLibrary` 传入已准备好的 `window-frame.dll`，即可同时覆盖原生解压路径及其失败报告。从仓库根目录运行以下命令。它验证 目录替换与回滚和两种文件占用替换方式；不属于单元测试通道。

```powershell
pwsh -NoProfile -File apps/desktop/scripts/smoke-windows.ps1 -Makensis $Makensis -SevenZip $SevenZip -PluginDir $PluginDir -FrameLibrary apps/desktop/.desktop-build/targets/win-x64/installer-ui/window-frame.dll
```

Windows 安装器在启动时和选定目标目录后检查应用是否正在运行，通过检查后才将新版本解压到安装目录旁边。通过同卷目录改名替换前，安装器会再次检查。运行中的应用会阻止安装；更新启动允许等待应用退出，最长十秒。同路径升级在替换成功前保留旧目录；解压失败时旧版不变，替换失败时尝试恢复旧目录。安装器在启动前清理旧版备份。强制结束安装器或断电可能留下 `.new-*` 或 `.old-*` 目录；不同安装位置或安装范围迁移仍使用 electron-builder 的旧卸载器流程。

目录改名、空目标目录删除和旧版恢复遇到 Windows 错误 5、32 或 33 时最多尝试十次，每次等待递增 250 毫秒（每个操作合计等待 11.25 秒）。其他错误立即停止。替换失败时，安装器将 Windows 错误、相关路径和恢复结果写入解压报告旁的 `directory-failure-<时间戳>.log`。如果恢复失败，安装器会清理未被占用的暂存文件并保留备份。上报此失败后，退出清理不再重试恢复。请保留报告所列的备份目录，并在重新安装前联系支持人员。静默安装保存相同的诊断，不显示弹窗。

解压失败时，安装器会把 7-Zip 的结果和完整错误输出写入更新缓存目录 `%LOCALAPPDATA%\<按包名派生>-updater\installer-logs\extract-failure-<时间戳>.log`（当前为 `deepseek-harness-uncensored-updater`），并在弹窗中显示首条错误行和 **复制错误信息** 按钮；静默安装只写入报告。未签名的 Windows 构建（`DSH_DESKTOP_UNSIGNED=1`）会将安装包命名为 `deepseek-harness-uncensored-<版本>-win-x64-unsigned.exe`，以免被误当作发布产物。

Windows 打包将 7-Zip 过滤器固定为 `BCJ`，以兼容内置的 NSIS 解码器。这样可以保留 x64 安装包中由依赖携带的 ARM64 二进制文件；自动 ARM64 过滤会生成该解码器无法解压的条目。

Windows dotenv 或机器 preset 中的 `DSH_DESKTOP_WINDOWS_COMPRESSION_LEVEL` 选择 `0` 至 `9` 的安装包归档压缩等级。省略时，现有 `ELECTRON_BUILDER_COMPRESSION_LEVEL` 环境覆盖仍然生效，否则 test 和 production 均默认为 `3`。手动 Windows workflow 的 `compression_level` 下拉默认选 `3`，也提供 `7`，与 Mac ZIP 选项一致；它对本轮覆盖文件中的设置。直接本地打包保留显式机器配置。Mac ZIP workflow 覆盖值必须为 `3` 或 `7`；空值在 macOS 上也非法。任何已定义的 Mac ZIP workflow 覆盖值（包括空值）均拒绝用于 Windows；非空的 Windows workflow 覆盖值拒绝用于 macOS。较低等级以安装包体积换取打包时间；修改发布 preset 前应验证完整签名 workflow 和产物体积。

NSIS 在安装阶段清理临时解压目录，完成后才显示完成页或自动启动应用。已安装的生产依赖保持为普通文件；启动时不会再次解压。安装仍会写入完整的应用目录树。

<a id="desktop-runtime-preparation"></a>

## Desktop 运行时准备

私有 Desktop Host 将三个分支内的实验浏览器提供方列为运行时依赖，确保本地包覆盖和代理接入使用 DSHU 实现。随包提供模块不会挂载提供方或下载 Chromium；由 profile 选择提供方与已安装的浏览器。

Electron 归档使用精确锁定的 Electron npm 包内 `checksums.json` 验证。缓存文件有效时无需重新向 GitHub 请求校验清单；目标校验值缺失或格式错误会停止准备，损坏缓存会在解压前被拒绝。没有缓存时仍需下载归档。

Windows 并行准备 Electron 和 primary-runtime；macOS 串行准备二者。只有两份运行时资源均成功，才会准备 CLI 并写入 `versions.json`。任一 Windows 运行时准备失败时，流程会等待另一路结束后再报告失败，且不写入 CLI 资源或版本记录。嵌套准备阶段的计时存在重叠，不能直接相加。

打包进程环境中的 `DSH_DESKTOP_PACKAGE_CACHE_DIR` 为共享的 `downloads` 和 `pnpm-store` 缓存指定非空绝对目录；省略时使用 `.desktop-build`。临时安装项目、lockfile 和配置仍逐次独立创建。运行时安装校验 store 完整性并复制包文件，防止后续签名修改缓存字节；清理时保留这些缓存。两个打包工作流使用 `runner.tool_cache/dsh-desktop-package-cache`；Windows 仓库依赖安装使用工作区盘根目录下独立的 `.pnpm-store`。两次安装日志均标明各自的 store 并报告包复用情况。可写缓存仅供可信构建任务共享；完整性校验不能隔离不可信的写入者。仅在没有任务使用缓存时清理。缓存磁盘用量由操作者管理，不自动淘汰。

Desktop [补丁策略](../scripts/runtime-patch-policy.ts) 将每份工作区补丁明确归为共享、仅工作区或仅运行时。共享项复用根目录补丁字节，并对照根锁文件校验 hash；仅运行时项使用仓库内的独立文件，不改变工作区安装。仅工作区补丁用于构建工具或已嵌入客户端 bundle 的依赖。未分类或过期的条目、文件缺失、hash 改变、解析版本不兼容，以及仅工作区包进入运行时，都会阻止打包。[准备脚本](../scripts/prepare-runtime-patches.ts) 只写入临时项目；pnpm 负责应用选中的补丁，应用失败时会报错。

Desktop 依赖 overrides 在补丁策略模块中单独声明，不从补丁版本推导。pi-ai 约束使运行时版本保持在共享补丁已验证的版本。受保护终端提供方和 `@microsoft/mxc-sdk@1.0.1` 均使用已验证的 `node-pty@1.2.0-beta.15` 补丁；出现第二个未修补的 PTY 版本会阻止打包。CLI 打包安装测试及其他交付流程保留各自的配置。

构建用临时项目以已提交的工作区锁文件为起点。冻结安装生产依赖前，[解析校验](../scripts/prepare-runtime-lockfile.ts)要求 registry 版本和解析记录与捕获的根锁文件一致，本地核心归档须匹配记录的完整性摘要。目标平台未选用的第一方可选原生包固定为源码版本，并保持排除本平台的 OS/CPU 元数据，不随本平台分发。意外版本、归档或解析记录会停止准备。主动升级依赖时，先更新工作区依赖与锁文件；准备过程不改写这些源码文件。

运行时安装保留严格的依赖构建审批。SSH 使用可移植的 JavaScript 实现：`ssh2` 和 `cpu-features` 明确拒绝可选原生构建脚本，与工作区策略一致。必要的 PTY 和 Koffi 构建脚本保持启用。外部插件配置仍保留各自设置。

每条打包命令都会构建仓库，打包以 dsh 和私有 Desktop Host 为根的第一方生产依赖闭包，并准备目标专用的 Electron 分发包和包含共享 pnpm CLI 的 primary-runtime。`prepare:dsh` 在构建时安装一次生产依赖图，准备物化包供 electron-builder 归档到 `app.asar/dsh`，移除包管理器元数据，并生成包含共享包版本和最终文件哈希的 `desktop-runtime.json`。macOS 签名构建先签名并验证原生文件，再生成清单；electron-builder 不对已签名的此目录重复进行嵌套签名。资源映射明确包含默认根目录过滤器会忽略的 `dsh/node_modules`；准备完成的运行时清单在原生签名后检查。原生可执行文件及库解包到 ASAR 旁；Python、独立 Node 和 pnpm 保留在外部 runtime 资源中。Windows 打包逐项检查准备好的 PE，确认其 ASAR 条目已标记为解包，且磁盘副本字节一致；未签名构建也执行此检查。Builder glob 规则用单字符通配符匹配 PE 文件名中的花括号，因此同目录中名称匹配的文件也可能被解包。准备好的运行时 smoke 沿用已验证的目标描述符，不使用构建宿主的架构。签名安装包、公证、已安装应用升级和各目标原生模块的验收需要发布环境。

Windows 运行时在原生签名前后封存文件清单，每次最多并发读取八个文件。读取失败时会等待未完成的读取结束，不替换描述符；封存成功后仍须完成后续的完整性与 smoke 检查。

macOS 签名打包在组装 App 时、代码签名前写入 `Contents/Resources/app-update.yml`，供并行 ZIP 与 DMG 路线使用的目录构建也执行此操作。签名钩子验证准确的更新源和 updater 缓存目录。写入发布完成记录前，流程会再次检查两条路线的副本和最终移入的 App；配置缺失或不匹配会阻止移入产物，因而也会阻止上传。

未压缩产物包含 Electron、物化后的 dsh 生产依赖树、pnpm，以及壳应用。安装包大小与文件系统占用不同；发布验收需要测量两者，以及 profile 插件存储和首次启动耗时。此布局用更多应用内文件换取消除用户机器上的核心包安装过程。

Windows 组装后运行时检查在较短的临时目录内验证应用副本。Python 和 Office 原生加载器会拒绝过长的构建路径，解析回原路径的目录联接也无法解决。归档完整性、原生导入、Host 启动和文档转换检查仍完整执行，子进程结束后移除临时副本。

macOS 产物准备和保留包检查使用 `DeepSeek Harness Uncensored.app`、`deepseek-harness-uncensored-` 归档前缀及 DSHU GitHub 更新源。

本地未签名打包按完整构建记录核对源码提交、产品元数据、构建配置和产物哈希。编译时间取自该记录；之后启动打包进程不会重新生成编译时间。

<a id="verification"></a>

## 安装与发布验收

Windows 以不带版本后缀的产品名称显示已安装应用，版本保留在单独的版本字段中。Desktop 的 `package.json` 中的 `author.name` 提供安装包发布者和可执行文件公司名称，与签名证书相互独立。Windows 和 macOS 的版权文本仍使用产品名称。重新构建的安装包在安装或升级时写入新元数据；既有安装在此之前保留原值。

一起保留生成的安装包、版本和打包记录。安装前检查签名与运行时验证结果，再按[已安装更新验收流程](../tests/installed-update/README.zh.md)记录安装后启动及升级证据。[Desktop 测试记录](../tests/README.zh.md)维护验证限制；工作流成功本身不代表 production preset、新工作站或已安装升级验收通过。

## 开发备注

XXX：出现磁盘空间不足、缓存持续增长或频繁人工清理时，评估空间监测、维护入口和自动淘汰。任何自动清理方案都需要与所有使用缓存的任务协调。
