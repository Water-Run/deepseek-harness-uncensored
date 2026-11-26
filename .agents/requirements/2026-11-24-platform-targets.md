# 五平台构建与验证目标（2026-11-24）

本文件固定本次发行要构建与验证的五个平台目标，以及每台机器的接入方式。发布前不得更改目标清单；设备变更必须在此处留痕。

## 目标矩阵

| 目标 | 设备 | 接入方式 | 备注 |
| --- | --- | --- | --- |
| Windows x64 | 本机 | 直接构建 | 打包命令在本仓库根目录执行 |
| Linux x64 · RPM | Rocky Linux 10.2 实机 `waterrun` | `ssh -p 22222 waterrun@192.168.10.40` | Fedora 容器内回归 RPM。也是两个 ARM64 设备的 SSH 跳板，Web 控制台地址为 `https://192.168.10.40:9090/`。 |
| Linux x64 · DEB | Debian 13 实机 `yynicepc` | `ssh -p 26022 yynicepc@192.168.10.57` | 构建 Linux x64，并验证 DEB 升级及隔离 X11 桌面。 |
| Linux arm64 | NVIDIA DGX Spark | `ssh -p 22222 waterrun@192.168.10.40` 后 `ssh dgxspark` | Ubuntu 24.04.5 LTS，aarch64。 |
| macOS arm64 | Mac Studio | `ssh -p 22222 waterrun@192.168.10.40` 后 `ssh yymacstudio` | macOS 26.6.2，arm64。 |

11 月 26 日从 Windows 维护机复核了两条直连和两条跳板入口，四台设备都通过已有 SSH 主机密钥校验。[两台 x86_64 实机的容量、工具链与验收范围](2026-11-18-linux-test-host.md#11-月-26-日新增实机)

## 11 月 26 日原生 ARM64 设备

| 设备 | 实测系统与容量 | 可用工具 |
| --- | --- | --- |
| DGX Spark `spark-49c8` | Linux `7.0.0-1025-nvidia`，20 个逻辑 CPU，约 121.7 GiB RAM，主目录所在卷约 3.1 TiB 可用 | cc、musl-gcc、dpkg-deb、fakeroot、Xvfb，系统 Node.js `24.21.0`、pnpm `11.28.5` |
| Mac Studio | Darwin `25.6.0`，macOS 构建号 `25G83`，16 个逻辑 CPU，128 GiB RAM，主目录所在卷约 84.6 GiB 可用 | Apple clang 21、Command Line Tools、codesign、Node.js `24.22.3`、pnpm `11.28.5` |

两台都能通过 HTTPS 访问官方 npm 注册表和 Node.js 下载站。候选源码和构建日志使用各账号 `~/.local/state/dshu-verification/` 下的专用目录。安装及会话升级结果以对应候选的回执为准。

## 验证用 Windows 副机

| 用途 | 接入方式 |
| --- | --- |
| 安装与升级实测（不占用本机） | `ssh -p 26222 Administrator@192.168.10.104` |

本机（Windows x64）只用于构建与自测；安装验证优先放在 `192.168.10.104`，避免打断日常工作。

## 远程构建约定

- 每台目标机先用 `uname -a` / `sw_vers`、`node -v`、`pnpm -v`、`git -C <clone> log -1 --oneline` 记录现场身份。
- 构建使用同一提交；产物名、大小与 SHA-256 回填到本文件末尾的「构建记录」。
- 远程机若缺工具链，记录缺口并停止该目标，不用替代产物冒充。
- 每个目标跑一次安装后的冒烟：启动、版本一致、关于页显示 `dsh-purge Community 1.7.20`。

## 构建记录

（构建时逐项填入：提交、时间、产物名、大小、SHA-256、冒烟结果。）

## 构建记录 2026-11-24

### Windows x64 · 已完成并验证

| 项 | 值 |
| --- | --- |
| 提交 | `e12f261ac7`（`main`） |
| 产物 | `deepseek-harness-uncensored-2026.11.24.3-win-x64-unsigned.exe` |
| 大小 | 443,927,890 字节 |
| SHA-256 | `A84001B8EC3D64AE4452833D8FDD018857900A772BE366488DE2F219334B5B30` |
| 本机打包 | `pnpm --dir apps/desktop run package:win:x64:unsigned --build-version auto`，8 项运行时冒烟通过（ConPTY、插件装卸、四预设、REA、Office） |
| 副机实装 | `192.168.10.104` 静默安装成功，注册表版本 `2026.11.24.3`，`app.asar` 内可检索 `dsh-purge Community`、`refusal/retry`、`uncensored:boost`、`dsh-refusal-retry`、`balance/clear` |

### Linux x64（DEB/RPM）· 阻塞

- 用过的方式：codeload tarball（git 协议在该机 `fetch` 100% 卡死）+ 本机 `git archive` 局域网投送。
- 已推进的节点：依赖安装（25 秒）、客户端编译（修正 `balance/clear` 端点分类后通过）、Electron 下载（`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后可下载）。
- 阻塞点：`prepare:runtime` → `preparePrimaryRuntime` 需要从 `https://nodejs.org/dist/...` 与 `https://github.com/astral-sh/python-build-standalone/releases/...` 取 Node 与 Python 运行时，两处在该网络下 `fetch failed`。
- 解除条件：为这两个下载提供可达镜像，或把 `scripts/primary-runtime/lock.json` 列出的归档预置到该机的 downloads 缓存后重跑同一命令。

### Linux arm64（DGX Spark）· 阻塞

- 同一路径，同一阻塞点：Node/Python 主运行时下载 `fetch failed`。
- 该机 `node v24.21.0`、`pnpm 11.28.5`、`uname -m aarch64` 已记录。

### macOS arm64（Mac Studio）· 待确认

- 已通过 `192.168.10.40` 跳板投送源码与脚本，构建任务在 `yymacstudio` 上运行；Electron 未设镜像，下载可能超时，结果以任务日志为准。

## 2026.11.24.3 的复现约定

- 任何目标的源码都从本机 `git archive HEAD` 投送，不在目标机依赖 GitHub git 协议。
- Electron 一律带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- 主运行时下载是当前唯一未被绕过的网络依赖。
## 五平台构建与安装验证 2026-11-24.3（完成）

主运行时缓存从各机旧树 `~/dshu-src/apps/desktop/.desktop-build/downloads` 复制到新树同路径后，`prepare:runtime` 不再依赖外网；Electron 统一走 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。四条远程构建命令一律显式传 `--build-version 2026.11.24.3`。

| 目标 | 产物 | 大小 | 安装验证 |
| --- | --- | --- | --- |
| Windows x64 | `deepseek-harness-uncensored-2026.11.24.3-win-x64-unsigned.exe` | 443,927,890 | `192.168.10.104` 静默安装，注册表 `2026.11.24.3`，asar 标记齐全 |
| Linux x64 · RPM | `...-linux-x86_64-unsigned.rpm` | 322,953,689 | `.40` `rpm -U` 成功，包版本 `2026.1124.3-1.x86_64` |
| Linux x64 · DEB | `...-linux-amd64-unsigned.deb` | 392,353,472 | `.57` `apt-get install` 成功，`dpkg -l` 显示 `2026.1124.3 amd64` |
| Linux arm64 | `...-linux-arm64-unsigned.deb` | 363,015,196 | `dgxspark` `apt-get install` 成功，`dpkg -l` 显示 `2026.1124.3 arm64` |
| macOS arm64 | `...-mac-arm64-unsigned.dmg` / `.zip` | 377,415,202 / 497,255,372 | `yymacstudio` 挂载 DMG，`CFBundleShortVersionString = 2026.1124.3` |

四台远程机的构建冒烟均在打包阶段通过：CLI 与主载荷版本一致、四预设就绪、REA 6.9.0 与 255 工具、Office 技能列出并加载、DOCX/XLSX/PPTX 转换与重算。

自动更新清单随构建产出：`latest.yml`、`latest-linux.yml`、`latest-linux-arm64.yml`、`latest-mac.yml`，其 `url`/`path` 与上传的 `-unsigned` 文件名一致。
## 2026.11.24.3 已发布

- 标签：`v2026.11.24.3`（指向 `7eaeddc605`），非草稿、非预发布，`releases/latest` 已指向它。
- 附件 10 件：五平台安装包 + 四个更新清单，全部 `uploaded`。
- 四个 feed 从 `releases/latest/download/<name>` 实测 200，版本 `2026.1124.3`，文件名与 sha512 与附件一致；Windows 安装包地址 302 到 CDN 正常。

### SHA-256

| 产物 | SHA-256 |
| --- | --- |
| `...-win-x64-unsigned.exe` | `A84001B8EC3D64AE4452833D8FDD018857900A772BE366488DE2F219334B5B30` |
| `...-linux-amd64-unsigned.deb` | `871F1E23207B6D3AED717CA175ADF5963153F48E54A4FCA790D21ABBA15F5807` |
| `...-linux-x86_64-unsigned.rpm` | `BEBD5E958996C18A77CB8BB9D415CDA57DAAE3400DA8EB5AE55A833BE6537DC1` |
| `...-linux-arm64-unsigned.deb` | `75E288AA37E376CCE828DD84979FCE975093F7E1AA8F34FC5A44A9FA2FFCADB0` |
| `...-mac-arm64-unsigned.dmg` | `CE723062EE9A0A10468343C3DC3703AC445BE8DB63A57CB42E2E94C8BB9F639C` |
| `...-mac-arm64-unsigned.zip` | `D51C6DFBA7EEDBDE8449A48A0F9E8D0C285F3688ADDBD3362079D7ACD8390B0F` |

### 待验

- 程序内升级的端到端实测：Windows 与 Linux 的链路按代码成立（未签名构建由 feed SHA-512 绑定），macOS 由 Squirrel 用已安装应用签名校验替换包，未签名包这条路径尚未实测。
