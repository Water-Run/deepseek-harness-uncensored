# Linux 测试设备迁移与 WSL 回收

用户指定后续 Linux 测试使用已有 SSH 链路中的 Fedora 设备。Windows 仍为首要桌面平台；macOS、Android＋Fedora PRoot 和全新安装器仍为未来计划。没有创建 Release 或上传公开资产。

## Fedora 测试入口

连接通过用户给定的 Windows SSH 跳板，再使用该设备已有的 `fedora` 别名；账号、端口及部署路径保存在本机 `%USERPROFILE%/DSHU-Deliveries/20261118/linux-test-connection.json`，不复制或改写 SSH 私钥。

实际设备 `WaterRun` 为 Fedora Linux 45 Workstation、x86_64，内核 `7.3.3-300.fc45.x86_64`，`systemd-detect-virt` 返回 `none`。17.8 Linux tar.gz 经两跳传输后，SHA-256 仍为 `895aa0179a032167999e30aa143954dbbda3040bf32af92d516cdc9d9cd95c01`。

归档释放在专属测试目录。实际执行通过 CLI 版本、干净构建身份及共享 SDK client 导入检查，Node 为 24.21.0，源码为 `a45e8f67f99decc961c540cfea02d938a21992c8`。没有调用模型、安装系统服务或操作用户桌面。跳板上的重复归档已在 Fedora 摘要核对后删除。

初测结果见同目录的 `fedora-device-result.json`；测试应用位于 `/home/waterrun/.cache/dshu-verification/fedora-device-057tee7h/`。当前没有验证 Fedora 上的完整图形界面、门户或发行安装，不能据此标记 Linux Desktop 全部完成。

Windows 跳板上的嵌套 SSH 不使用管道传入 Python 程序；该方式会等待 stdin 关闭。脚本经 SCP 传输，再以 `ssh -n` 执行文件，已经通过。连接和命令前重新核对设备及路径。

## WSL 开发状态保全

本机 `/home/linzh/.cache/dshu-verification` 的三个工作区、Git 元数据、reflog 和 32 条 stash 已归档。226,715 个文件或链接逐项核对通过，三个 Git 元数据副本经过实际恢复、stash 核对和连通性检查。共享对象独立保存；浅克隆信息和原始对象编码保留。

备份位于 `%USERPROFILE%/DSHU-Backups/20261118-wsl-retirement/`，归档大小 2,721,484,393 字节，SHA-256 为 `311fdf22614e4c8a94459cf3ebea2f3e940aeea0e05facf6f11f1c870df449af`。归档、`borrowed-objects/` 及其清单须一起保留，恢复步骤见该目录的 `README.md` 和 `hydrate_git.py`。备份 ACL 仅允许当前用户、SYSTEM 和 Administrators。

确认备份、规则外挂载和进程引用后，已移除这一专用缓存，文件系统净空闲增加 164,494,442,496 字节，约 153.2 GiB。其余 Ubuntu 数据、其他发行版、Windows 安装数据及 C/D 盘交付记录不在清理范围。原 WSL 构建、解包和引擎执行路径已经回收，不再运行旧 WSL 构建脚本；需要历史状态时从备份恢复。

## Windows 磁盘与内存收尾

已执行文件系统 TRIM 和 WSL 关闭，记录中 `vmmemWSL` 曾退出；随后 Codex 主进程的 WSL 连接重试在约 12 秒后重新唤起 Ubuntu。调用方 PID、父进程和观察结果见备份目录的 `wsl-stopped-observation.json`。后续应在 Codex 的连接设置中断开这条 Ubuntu 连接；不通过改写运行中的应用状态文件规避连接管理。

虚拟磁盘 `D:/WSL/Ubuntu/ext4.vhdx` 仍约 203.9 GiB；Linux 文件系统的空闲增加不等同于 Windows D 盘已获得全部空间。非管理员 Hyper-V 查询明确返回权限不足，单次 UAC 提权请求已经发出，压缩尚待用户确认。仅压缩已停止且未附加的这一动态 VHDX，使用[官方 Optimize-VHD 命令](https://learn.microsoft.com/en-us/powershell/module/hyper-v/optimize-vhd)。操作脚本及结果入口为备份目录的 `compact-vhd.ps1` 和 `vhd-compaction-result.json`；不重复发起仍在等待的请求，不在磁盘仍被附加时执行压缩。

在断开自动重连并完成压缩前，物理磁盘回收和持续内存释放保持未完成状态。此前被自动审批拒绝的 Windows 构建目录及迁移备份没有重试或删除。
