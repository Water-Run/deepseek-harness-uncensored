# DSHU 开发交接

**本地 2026.11.17.8 已保留数据安装并启动，没有发布 Release，Goal 保持活动。** 当前 36 项完成、9 项进行中及 3 项未来计划，完整范围见 [TODO](TODO.md)。继续实现既有范围，减少重复测试；发布须逐次取得明确许可。

## 当前交付

构建源码 `a45e8f67f99decc961c540cfea02d938a21992c8`，显示/内部版本 `2026.11.17.8` / `2026.1117.8`，提供 Windows exe、Linux deb/tar.gz，未签名。构建于 11 月 17 日启动，北京时间 11 月 18 日安装验收。[当前交付、摘要及恢复](requirements/2026-11-17.8-delivery.md)

修复 Desktop 共享 SDK client 缺失，以及 Host 使用 CLI 依赖图导致外部提供方无法导入它的问题。四个正式 npm 提供方在实际 Windows 包中注册，四模式就绪、无加载警告。Codex 移除、回装及不兼容 tarball 的文件和模块恢复通过；更高兼容版本的成功升级仍待验收。

17.7 候选没有安装，失败材料和安装器保留，Linux 归档在 `D:/DSHU-Deliveries/20261117/rejected-2026.11.17.7/`。后续检查从外部插件导入 SDK client，避免只验证包内文件存在。Windows 17.8 实际安装后完成全量 ASAR 清单核对，没有另建完整 NSIS 解包副本。

[公开预发布 17.5](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5) 保持不变，本次没有创建 Release、修改公开资产或上传文件。源码已推送；没有远端 CI 运行，不能记作 CI 通过。

## Linux 测试与 WSL 状态

后续 Linux 测试转到用户指定的 Fedora 45 x86_64 实体设备，通过既有 Windows SSH 跳板的 `fedora` 别名访问。连接和部署信息在 `%USERPROFILE%/DSHU-Deliveries/20261118/linux-test-connection.json`；CLI、版本身份和 SDK 导入已经通过，图形界面与门户尚未验收。[设备与回收记录](requirements/2026-11-18-linux-test-host.md)

本机 WSL 的 DSHU 专用缓存已经归档并清理，文件系统净增加约 153.2 GiB 空闲。三个工作区及 32 条 stash 已验证可恢复，备份在 `%USERPROFILE%/DSHU-Backups/20261118-wsl-retirement/`，恢复时须同时保留归档和 `borrowed-objects/`。旧 `/home/linzh/.cache/dshu-verification` 路径已移除，不再启动本机 WSL 或调用旧 Linux 构建脚本。

Codex 的自动连接会在关闭后重新唤起 Ubuntu，需用户在连接设置中停用该条连接。压缩 `D:/WSL/Ubuntu/ext4.vhdx` 的单次 UAC 请求尚待确认，执行会话句柄 `96010` 仍在等待；确认前不得重启该请求或把超时当作结束。准备脚本为备份目录的 `compact-vhd.ps1`，结果为 `vhd-compaction-result.json`。Windows 物理空间和持续内存回收尚未完成，以最新回执为准。

## 恢复与运行

- 备份 `D:/DSHU-Backups/20261117T161831Z-before-20261117-8-data`：7,366 文件、零链接；安装后摘要一致，官方 DSH 两个关键文件未变。恢复前另存当前数据。
- 17.6 恢复包摘要 `17033bf92cae789607475d3e6e641528ee871cd20982188b5eb393c162ffceb1`。恢复记录为交付目录的 `accepted-2026.11.17.6/current-windows-manifest.json`。
- 常规启动主 PID `154848`，令牌直接验证未提权，用户为 `WATERRUN\linzh`；观察期间响应且无新增崩溃。操作前重新核对进程。旧主进程明确终止，不记作正常退出或系统重启验收。
- 本版材料为 `%USERPROFILE%/DSHU-Deliveries/20261117/candidate-2026.11.17.8/`，重点为两平台 manifest、`installed-update-result.json`、`installed-payload-result.json`、`normal-launch-result.json` 和 `official-plugins/acceptance.json`。历史失败、源码和 stash 保留。

## 仍有效的执行验收

[SSH 资源匹配回执](requirements/2026-11-17-ssh-resource-receipts.md)和[数据库资源关联](requirements/2026-11-17-database-resource-bindings.md)已随本地 17.6 交付并保留在本包。SSH 客户端/helper 使用协议 4，需配套部署和更新固定摘要；持久化字段及原始 Session 录制未改变。

[PostgreSQL 16.15 与 MySQL 8.0.46](requirements/2026-11-17-native-database-engines.md)共 14 个实际引擎场景通过，含独立数据回读、存储重开及正常退出。远端物理身份、其他协议与实体平台仍按 TODO 保留范围，不重复这轮引擎验收。

[Frida 关闭修复](requirements/2026-11-17-frida-prime-close.md)保留 REA 6.9.0、Frida 17.23.2，两平台自有目标证据继续有效。管理器摘要 `7d6fa8fca95b7168cdbc629d7a717d597845de3ce4e42793076471ff7d0666ea` 已在本包核对；17.25.1/17.26.4 未采用，不把失败候选当作成功。

## 工作约束

保持 main、中文提交及正常 hooks，不使用 Computer Use。用户已明确要求：创建 GitHub Release、上传发布资产及公开发布须逐次取得许可；继续开发、本地打包及代码推送不视为发布许可。已公开的 17.5 保留，不擅自修改。安装和重启 DSHU 的既有授权保留；没有授权签名或重启系统。Goal 继续活动，不沿用此前已经履行的暂停指令。

高级保护和所有限额默认关闭，输入预测开启，余额默认 15 秒/最小 3 秒，关闭旁问自动清理关闭，`/clear` 仅旁问可用。macOS ARM、Android＋Fedora PRoot 和全新安装器本轮不开发。

Windows 构建使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`。私有 `.env.windows` 使用 npm 官方 registry；代理下载失败后，仅在本次进程中清除代理变量直连成功。供应链检查未放宽。首次 pnpm 烟测超时后，同一运行时独立检查通过；后续成功 run 见交付记录。

## 清理与工作约束

新增拒绝路径 `D:/Coding/deepseek-harness-uncensored/apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-17T15-19-43.361Z-nSHqhO/win-unpacked`：16,414 文件、1,591,144,393 字节，零链接、零活动引用，失败候选安装器已另存并核对摘要。递归删除在创建进程前被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，不重试、换方法或删除父目录。记录为 `20261117/rejected-17-7-cleanup-{audit,rejected}.json`。

本轮新路径 `D:/DSHU-Delivery-Work/20261117/installer-check-O4n6lL`：16,425 文件、2,035,344,333 字节，无链接或活动引用，实际安装及保留安装器摘要已核对。递归删除被自动审批以 `blocked by policy` 拒绝，约 1.90 GiB 保留；不得重试、改名、换方法或删除父目录。回执为 `20261117/windows-17-6-extraction-cleanup-{audit,rejected}.json`。

新增保留路径 `C:/Users/linzh/AppData/Local/Temp/desktop-native-smoke-Cih1l3`：删除被自动审批以 `blocked by policy` 拒绝，不重试、不替换方法或删除父目录。回执 `20261117/native-smoke-cache-cleanup-rejected.json`。该失败缓存不属于发布资产。


本轮失败解包副本 `D:/DSHU-Delivery-Work/20261117/installer-check-xdJ7KU` 已核对 16,425 文件、2,035,257,376 字节、无链接/活动引用，关键文件与成功验收及实装一致。删除被自动审批以 `blocked by policy` 拒绝，约 1.90 GiB 保留；不得重试、换方法或删除父目录。回执为 `20261117/failed-extraction-cleanup-{audit,rejected}.json`。

独立的项目私有 pnpm 打包缓存已维护，移除 49,184 文件、784 包；D 盘操作前后净增加约 1.27 GiB。没有触及上述拒绝目录；后续构建仍须正常获取供应链元数据，不放宽校验。记录为 `20261117/private-package-store-prune-{result.json,log}`。

`.16.3` 新重复目录 `D:/Coding/deepseek-harness-uncensored/apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-16T05-13-46.662Z-luBHCM/win-unpacked` 已核验：16,414 文件、1,590,812,052 字节、无链接和活动执行文件引用，安装器、恢复和实装均已验证。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留；不得重试、换方法或删除包含它的父目录。回执为 `20261116/windows-16-3-unpacked-cleanup-{audit,rejected}.json`。

本次通过 pnpm 维护独立的项目私有包缓存，移除 50,001 文件、1,246 包；D 盘操作前后净增加约 1.37 GiB。目标为 `.desktop-build/pnpm-store/v11`，未触及上述拒绝目录。记录为 `20261116/private-package-store-prune-{result.json,log}`；再次构建需要正常获取供应链元数据，不能放宽校验。

本轮组件解包验证缓存 `D:/Coding/deepseek-harness-uncensored/packages/experimental/inspector/.dsh-build/packed-check-lcvhwfnm.tcu` 的删除被自动审批以 `blocked by policy` 拒绝，约 63 MiB、2,837 文件仍保留。不得重试、换删除方式或删除包含它的父目录；回执为 `20261116/protected-inspector-packed-cleanup-rejected.json`。已验证组件归档另存 `protected-inspector-checked.tgz`；独立且无引用的原型 JS chunk 已成功清理，不能据此声称上述解包目录已删除。

`.16.2` 重复解包目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T22-30-02.352Z-xXBc25/win-unpacked` 已核对 16,414 文件、1,590,804,858 字节，无链接和进程引用，恢复安装器及实装关键文件摘要一致。删除命令在创建进程前被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，没有换方式重试。证据为 `windows-16-2-unpacked-cleanup-{audit,rejected}.json`；不要再删除此目录或包含它的父目录。

本轮 `2026.11.16.1` 的重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T16-57-51.186Z-97sD6H/win-unpacked` 已核对 16,411 文件、1,590,740,486 字节，无链接和进程引用，安装器及实装验证通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，未换方式重试。记录在 `20261116/windows-unpacked-cleanup-{audit,rejected}.json`。不要再尝试此目录或包含它的父目录。

<details>
<summary>此前已核验的清理及拒绝记录</summary>


第 9 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T14-56-42.102Z-iG7VWe/win-unpacked` 已核验 16,411 文件、1,590,707,569 字节，无链接或进程引用，安装器与实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，未换方式重试。记录为 `windows-unpacked-9-cleanup-rejected.json`。

第 8 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T12-15-21.912Z-28UNek/win-unpacked` 已核验 16,410 文件、1,590,704,861 字节，无链接或进程引用，恢复安装器与实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，未换方式重试。记录为 `windows-unpacked-8-cleanup-rejected.json`。

第 7 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T10-08-04.390Z-pQnbhz/win-unpacked` 已核验 16,410 文件、1,590,704,440 字节，无链接或进程引用，恢复安装器与实装检查通过。删除仍被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，未换方式重试。记录为 `windows-unpacked-7-cleanup-rejected.json`。

第 6 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T09-12-09.714Z-r9RSGc/win-unpacked` 已核验 16,411 文件、1,590,690,261 字节，无链接或进程引用，恢复安装器及实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，没有重试。记录为 `windows-unpacked-6-cleanup-rejected.json`。

第 5 版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T06-15-31.325Z-BsBDM7/win-unpacked` 已核验：16,411 文件、1,590,687,914 字节，无链接、无进程引用；恢复安装器和实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，没有重试；回执为 `windows-unpacked-5-cleanup-rejected.json`。此前被拒绝的路径同样保留，不换方式重试。


此前已删除约 2.92 GiB 的 Linux 旧解包逻辑数据；未把它当作 Windows 宿主即时释放量。历史上约 5.78 GiB、两个构建目录及 C 盘约 1.9 GiB 旧解包目录的删除被自动审批以 `blocked by policy` 拒绝，仍保留，没有换方式重试。此前已核验 `.2` 的旧 Windows 解包目录 `D:/DSHU-Delivery-Work/20261115/installer-check-CtUwda`：16,422 个文件、2,035,029,157 字节、无链接或进程引用，原安装包摘要一致。其删除同样被自动审批以 `blocked by policy` 拒绝；约 1.90 GiB 仍保留，未换方式重试，回执为 `old-windows-2-extraction-cleanup-rejected.json`。第 4 版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T03-41-25.591Z-vBjugI/win-unpacked` 也已核验：16,411 文件、1,590,687,931 字节、无链接和进程引用，安装器与已安装版本均已验证。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，未换方式重试；回执为 `windows-unpacked-4-cleanup-rejected.json`。安装包、备份和回执继续保留。

继续时读取 TODO 并核对实际工作树与安装版本。保持 main、中文提交、正常 Git hooks，不使用 Computer Use。进阶目标保护和所有限额默认关闭；保护按域名/主机规则、服务器/数据库、审计联动顺序推进。

</details>
