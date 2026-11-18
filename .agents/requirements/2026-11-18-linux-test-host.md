# Linux 测试设备迁移与 WSL 回收

用户指定后续 Linux 测试使用已有 SSH 链路中的 Fedora 设备。Windows 仍为首要桌面平台；macOS、Android＋Fedora PRoot 和全新安装器仍为未来计划。没有创建 Release 或上传公开资产。

## Fedora 测试入口

连接通过用户给定的 Windows SSH 跳板，再使用该设备已有的 `fedora` 别名；账号、端口及部署路径保存在本机 `%USERPROFILE%/DSHU-Deliveries/20261118/linux-test-connection.json`，不复制或改写 SSH 私钥。

实际设备 `WaterRun` 为 Fedora Linux 45 Workstation、x86_64，内核 `7.3.3-300.fc45.x86_64`，`systemd-detect-virt` 返回 `none`。17.8 Linux tar.gz 经两跳传输后，SHA-256 仍为 `895aa0179a032167999e30aa143954dbbda3040bf32af92d516cdc9d9cd95c01`。

归档释放在专属测试目录。实际执行通过 CLI 版本、干净构建身份及共享 SDK client 导入检查，Node 为 24.21.0，源码为 `a45e8f67f99decc961c540cfea02d938a21992c8`。没有调用模型、安装系统服务或操作用户桌面。跳板上的重复归档已在 Fedora 摘要核对后删除。

初测结果见同目录的 `fedora-device-result.json`；测试应用位于 `/home/waterrun/.cache/dshu-verification/fedora-device-057tee7h/`。当前没有验证 Fedora 上的完整图形界面、门户或发行安装，不能据此标记 Linux Desktop 全部完成。

Windows 跳板上的嵌套 SSH 不使用管道传入 Python 程序；该方式会等待 stdin 关闭。脚本经 SCP 传输，再以 `ssh -n` 执行文件，已经通过。连接和命令前重新核对设备及路径。

## 11 月 18 日重连预检

转发曾恢复监听并进入 Fedora，重新核对的 17.8 ASAR 摘要仍与保留归档一致。系统 Node 为 22.23.1、pnpm 为 11.10.0，不能直接替代本仓所需工具；现有包内独立 Node 为 24.22.1，另有包内 pnpm，使用前再核对版本。此前结果的 24.21.0 指 Electron 内嵌 Node，两者不混记。

`.cache` 挂载为 4 GiB tmpfs，剩余约 1.32 GiB；主目录位于 btrfs，有约 128 GiB 空闲。已准备 rc.4 构建脚本，使用磁盘目录 `.local/state/dshu-verification/`、独立缓存和较低进程优先级，不改系统包及全局工具。脚本上传时随后再次发生 SSH 握手超时，未完成上传，Linux 构建没有启动，不将本地脚本或监听端口视为已运行任务。

预检与上传失败证据在同日交付目录的 `fedora-rc4-preflight.log`、`fedora-rc4-storage.log` 和 `fedora-rc4-build-launch.log`；恢复连接后先核对是否已有作业，再继续构建。不会启动本机 WSL。

构建输入已更新至 Windows 18.4 对应源码 `1db33630ec`，准备文件为 `fedora-rc4-18-4-build.py`。两次只读探测返回 `x86_64`，状态查询遇到 SSH 握手超时，向 Fedora 传输脚本时连接关闭。脚本已暂存到 Windows 跳板。Fedora 构建尚无启动回执，重连后先检查 `~/.local/state/dshu-verification/linux-20261118-rc4-1db3363/status.json` 与对应 worker 进程。

## Fedora 实体机 18.7 构建

恢复连接后，已在用户指定设备启动源码 `92d348ae0173204ed13421b2d621795f726b0e85` 的 18.7 构建。作业目录为 `~/.local/state/dshu-verification/linux-20261118-rc4-92d348a/`，进程 PID 为 `3553433`。已确认实际进程进入依赖安装阶段，私有工具为 Node 24.22.1 和 pnpm 11.28.5。

随后转发出现握手超时和拒绝连接，构建终态尚未回读。再连接时以同一进程和作业的 `status.json` 为准。源码、暂存、启动及读回证据位于本地交付目录的 `fedora-rc4-18-7-*.log`。已验证 Linux 归档仍为 17.8。

同一进程的依赖日志显示，Frida 17.23.2 的预构建下载中止，安装器转入源码构建，下载工具链与 SDK 后开始克隆 Frida Core。已取得与官方 SHA-256 一致的 Linux x64 预构建归档，并确认其中的绑定与 17.8 Linux 归档内的二进制一致。校验归档已暂存于 Windows 跳板。[Frida 官方版本](https://github.com/frida/frida/releases/tag/17.23.2)

Fedora 的作业私有缓存已回读 SHA-256，与官方预构建一致。同一次回读确认原进程 `3553433` 仍在依赖阶段，进程树包含 Frida 源码构建。转发随后再次中断，尚未收到使用预构建继续依赖安装的回执。证据为 `license-review/frida-linux-prebuild-18-7-boundary-verification.json`、`fedora-rc4-18-7-next-live-process.log` 和 `fedora-rc4-18-7-resume-one-connection.log`。

## WSL 开发状态保全

本机 `/home/linzh/.cache/dshu-verification` 的三个工作区、Git 元数据、reflog 和 32 条 stash 已归档。226,715 个文件或链接逐项核对通过，三个 Git 元数据副本经过实际恢复、stash 核对和连通性检查。共享对象独立保存；浅克隆信息和原始对象编码保留。

备份位于 `%USERPROFILE%/DSHU-Backups/20261118-wsl-retirement/`，归档大小 2,721,484,393 字节，SHA-256 为 `311fdf22614e4c8a94459cf3ebea2f3e940aeea0e05facf6f11f1c870df449af`。归档、`borrowed-objects/` 及其清单须一起保留，恢复步骤见该目录的 `README.md` 和 `hydrate_git.py`。备份 ACL 仅允许当前用户、SYSTEM 和 Administrators。

确认备份、规则外挂载和进程引用后，已移除这一专用缓存，文件系统净空闲增加 164,494,442,496 字节，约 153.2 GiB。其余 Ubuntu 数据、其他发行版、Windows 安装数据及 C/D 盘交付记录不在清理范围。原 WSL 构建、解包和引擎执行路径已经回收，不再运行旧 WSL 构建脚本；需要历史状态时从备份恢复。

## Windows 磁盘与内存收尾

已执行文件系统 TRIM 和 WSL 关闭，记录中 `vmmemWSL` 曾退出；随后 Codex 主进程的 WSL 连接重试在约 12 秒后重新唤起 Ubuntu。调用方 PID、父进程和观察结果见备份目录的 `wsl-stopped-observation.json`。后续应在 Codex 的连接设置中断开这条 Ubuntu 连接；不通过改写运行中的应用状态文件规避连接管理。

压缩后的首次 Windows 回读显示 `D:/WSL/Ubuntu/ext4.vhdx` 为 54,409,560,064 字节，较 TRIM 后记录缩小约 153.3 GiB。检查时 D 盘空闲约 233.4 GiB，两次进程快照均未发现 `vmmemWSL`。早先的提权任务已退出，`compaction-launch-error.json` 记录未返回执行回执。磁盘变小的执行方和持续内存释放状态仍待核实。复查记录位于备份目录的 `windows-storage-observation-20261118.json`。

北京时间 17:22 再次读取 Windows 进程与文件元数据，未发现 `vmmemWSL`、`wslhost` 或 `wslrelay`。VHDX 仍为 54,409,560,064 字节，最后写入时间为 09:39:59。此次快照记录在交付目录的 `windows-wsl-retirement-late-readback.json`。
