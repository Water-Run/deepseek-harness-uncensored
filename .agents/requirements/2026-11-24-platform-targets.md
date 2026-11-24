# 五平台构建与验证目标（2026-11-24）

本文件固定本次发行要构建与验证的五个平台目标，以及每台机器的接入方式。发布前不得更改目标清单；设备变更必须在此处留痕。

## 目标矩阵

| 目标 | 设备 | 接入方式 | 备注 |
| --- | --- | --- | --- |
| Windows x64 | 本机 | 直接构建 | 打包命令在本仓库根目录执行 |
| Linux x64 · RPM | `waterrun@192.168.10.40:22222` | `ssh -p 22222 waterrun@192.168.10.40` | 该机另有 Web 控制台 `https://192.168.10.40:9090/` |
| Linux x64 · DEB | `yynicepc@192.168.10.57:26022` | `ssh -p 26022 yynicepc@192.168.10.57` | Debian 13，内核 6.12.118+deb13-amd64 |
| Linux arm64 | 经跳板 `192.168.10.40` 进入 `dgxspark` | `ssh -p 22222 waterrun@192.168.10.40` 后 `ssh dgxspark` | NVIDIA DGX Spark，Ubuntu 7.5.0 / aarch64，IP `192.168.5.19` |
| macOS arm64 | 经跳板 `192.168.10.40` 进入 `yymacstudio` | `ssh -p 22222 waterrun@192.168.10.40` 后 `ssh yymacstudio` | Mac Studio，用户 `yymacstudio` |

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

## 复现约定

- 任何目标的源码都从本机 `git archive HEAD` 投送，不在目标机依赖 GitHub git 协议。
- Electron 一律带 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- 主运行时下载是当前唯一未被绕过的网络依赖。