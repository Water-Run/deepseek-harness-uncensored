# DSHU 开发交接

[Windows x64 首发交接与缺口清单](requirements/2026-11-19-first-release-handoff.md)记录当前源码和实装的对应关系、剩余任务、Release 核验与资料回退。

**本地 2026.11.18.11 已保留资料安装并启动。** 首次正式发布计划为 Windows x64。当前 36 项完成、8 项进行中、4 项列入后续版本。[开发清单](TODO.md)

## 当前交付

当前 Windows 构建源码 `5f9a129fedc44de85bb6a405b4ae60a866820ead`，显示和内部版本分别为 `2026.11.18.11` 和 `2026.1118.11`。本版包含更新渠道、重定向和差分索引校验。原位更新核对 7,428 个资料文件、实装载荷和启动。[交付与恢复](requirements/2026-11-18.11-delivery.md)

已交付流量 JSON 导出、连接切换及请求竞态修复、可选保护缺失提示。四个正式 npm 提供方完成 rc.3 → rc.4 升级及实际注册，四模式就绪，无 Host 加载警告。CLI 升级不运行依赖构建脚本，不调用模型账号，应用 ASAR 和升级前测试 patch 不变。

18.1 rc.3 候选已验证但未安装；17.7 失败候选仍隔离保留。检查实际外部插件导入 SDK client 和注册情况，不能只以包内文件存在代替运行通过。[历史 18.1](requirements/2026-11-18.1-delivery.md) · [历史 17.8](requirements/2026-11-17.8-delivery.md)

[公开预发布 17.5](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5) 保持不变。本次没有创建 Release、修改公开资产或上传文件。源码已经推送；远端没有 CI 运行记录，不能记作 CI 通过。

## 当前开发

当前交付 [Windows x64 首发打包交接](requirements/windows-x64-first-release.md)。首发完整候选仍待构建与实装，rc.5 升级暂缓。真实目标保护、资源物理身份、关机与重启以及许可证事项按清单推进。内核和界面验证见 [rc.5 适配](requirements/2026-11-18-dsh-rc4.md#上游-rc5-对照2026-11-19)与[可选运行时反馈](requirements/2026-11-18-optional-runtime-feedback.md)。

已复核当前实装、历史安装器和回退文件的摘要。[同一候选的验收单](requirements/windows-x64-first-release.md#同一候选的验收单)列出每项已有证据及需要候选实包验证的内容。

## Linux 测试与 WSL 状态

Linux x64 验收列入后续版本。继续时使用用户指定的 Fedora 45 x86_64 实体机，经既有 Windows SSH 跳板的 `fedora` 别名访问。连接记录在 `%USERPROFILE%/DSHU-Deliveries/20261118/linux-test-connection.json`。CLI、版本身份、SDK 导入、18.7 依赖及 Frida 预构建已通过，图形界面与门户待验收。打包预检因缺少 `musl-gcc` 退出，工具链源归档已校验。[设备与回收记录](requirements/2026-11-18-linux-test-host.md)

本机 WSL 的 DSHU 专用缓存已经归档并清理，文件系统净增加约 153.2 GiB 空闲。三个工作区及 32 条 stash 已验证可恢复，备份在 `%USERPROFILE%/DSHU-Backups/20261118-wsl-retirement/`，恢复时须同时保留归档和 `borrowed-objects/`。旧 `/home/linzh/.cache/dshu-verification` 路径已移除，不再启动本机 WSL 或调用旧 Linux 构建脚本。

VHDX 实测从约 203.9 GiB 降至 50.7 GiB。北京时间 17:22 和 18:36 均未发现 WSL 虚拟机进程，18:36 的 `WslService` 为 `Stopped`。此前提权任务已退出且未返回压缩回执。Codex 的重连设置尚未操作。[Windows 磁盘与内存收尾](requirements/2026-11-18-linux-test-host.md#windows-磁盘与内存收尾)

## 恢复与运行

18.11 的安装器、资料备份和 18.10 恢复步骤见[本地交付记录](requirements/2026-11-18.11-delivery.md#安装与恢复)。Linux 已验证归档为 17.8。

两版真实 Host 已完成合成资料的[隔离回退与回读](requirements/2026-11-18.11-delivery.md#隔离回退演练2026-11-19)。旧版可读升级前副本，新版资料另存后可重开。

[原始升级前备份](requirements/2026-11-18.11-delivery.md#原始备份完整性复核2026-11-19)的 7,428 个文件也已逐一复核完整性。正式候选的实装资料回退验收仍在[首发验收单](requirements/windows-x64-first-release.md#同一候选的验收单)。

Windows 配置恢复已用实装载荷和独立资料验证。证据与测试替代范围见[启动时的配置恢复](requirements/2026-11-18.9-delivery.md#启动时的配置恢复)。

## 仍有效的执行验收

Windows 18.2 的本地文件保护冷重启通过：完全保护拒绝读写、审计只读、测试写入和清空规则后的新写入均由实际提供方执行并独立回读。规则修订 2 与 27 条审计在新 Host 保留。没有改用户配置，不代表系统重启或远端/数据库冷重启，见[记录](requirements/2026-11-18-protection-cold-restart.md)。

[SSH 资源匹配回执](requirements/2026-11-17-ssh-resource-receipts.md)和[数据库资源关联](requirements/2026-11-17-database-resource-bindings.md)已随本地 17.6 交付并保留在本包。SSH 客户端/helper 使用协议 4，需配套部署和更新固定摘要；持久化字段及原始 Session 录制未改变。

[PostgreSQL 16.15 与 MySQL 8.0.46](requirements/2026-11-17-native-database-engines.md)共 14 个实际引擎场景通过，含独立数据回读、存储重开及正常退出。远端物理身份、其他协议与实体平台仍按 TODO 保留范围，不重复这轮引擎验收。

[Frida 关闭修复](requirements/2026-11-17-frida-prime-close.md)保留 REA 6.9.0、Frida 17.23.2，两平台自有目标证据继续有效。管理器摘要 `7d6fa8fca95b7168cdbc629d7a717d597845de3ce4e42793076471ff7d0666ea` 已在本包核对；17.25.1/17.26.4 未采用，不把失败候选当作成功。

## 工作约束

保持 main、中文提交和正常 hooks，按用户要求通过命令行和自动化测试操作。创建 GitHub Release、上传发布资产、公开发布、签名和系统重启各按用户授权执行。已公开的 17.5 保留。用户已授权安装和重启 DSHU。周额度降至约 3% 时保存当前成果、缺口和证据，并暂停 Goal 等待续接指令。

高级保护和所有限额默认关闭，输入预测开启，余额默认 15 秒/最小 3 秒，关闭旁问自动清理关闭，`/clear` 仅旁问可用。macOS ARM、Android＋Fedora PRoot 和全新安装器本轮不开发。

Windows 构建使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`。私有 `.env.windows` 使用 npm 官方 registry；代理下载失败后，仅在本次进程中清除代理变量直连成功。供应链检查未放宽。首次 pnpm 烟测超时后，同一运行时独立检查通过；后续成功 run 见交付记录。

## 清理与工作约束

11 月 19 日清理了 D 盘构建目录中 11 组已归档的旧 Windows 安装器和块映射，共 22 个文件。逐文件回读确认交付归档与清理前的 SHA-256 一致，D 盘净释放 4.52 GiB，剩余 216.10 GiB。18.11 当前安装器与 18.10 回退包通过摘要核对，两个块映射仍在。重复文件的原路径、保留副本及摘要见 `%USERPROFILE%/DSHU-Deliveries/20261119/duplicate-windows-artifacts-result.json`。

11 月 19 日另核验 `apps/desktop/.desktop-build/targets/win-x64/electron-preparations` 的 38 份 Electron 44.7.0 预备目录。各相对文件路径、长度和 SHA-256 摘要一致，检查时没有相关构建进程。自动审批以 `blocked by policy` 拒绝删除 36 份旧副本，约 12.93 GiB。进程未启动，38 份全部保留，此次释放 0 字节。当前安装、18.10 回退包、18.11 安装包及原始 Electron 归档摘要均回读一致。审计和拒绝回执见 `%USERPROFILE%/DSHU-Deliveries/20261119/electron-preparation-duplicates-{audit,rejected}.json`。

新增打包任务在本次记录目录解压 Electron，组装及产物校验成功后只清理该任务的副本。仅准备与构建或校验失败时保留现场，共享下载归档继续复用。78 项定向测试通过，真实打包空间回收待下次构建验证。旧预备目录全部保留。日志为 `%USERPROFILE%/DSHU-Deliveries/20261119/electron-preparation-lifecycle-tests.log`。[打包说明](../apps/desktop/packaging/README.zh.md)

18.11 首轮失败的安装器及 `.blockmap` 已清理，D 盘实测增加 441,376,768 字节，约 421 MiB。交付版 18.11 和回退版 18.10 的安装器、索引均通过 SHA-256 回读。失败日志、原件摘要和清理回执位于 `20261118/windows-18-11-attempt-1-*`。

自动审批以 `blocked by policy` 拒绝递归清理失败批次的 `D:/DSHU-Delivery-Work/20261118/source-fc4c9ddf7b/apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-18T12-12-38.795Z-aNm4a0/win-unpacked`。目录内 16,416 个文件、1,590,480,253 字节保留。检查未发现联接或活动引用。拒绝回执为 `20261118/windows-18-11-attempt-1-runtime-cleanup-rejected.json`。保留该目录的拒绝记录，不重试或清理其父目录。

启动恢复夹具的三个临时目录 `dshu-startup-recovery-{GSgw7P,VPorkr,AgqWGI}` 总计约 20 MiB。自动审批以 `blocked by policy` 拒绝递归清理。进程已退出，证据已保存，目录保留。摘要 `windows-18-9-startup-recovery-result.json` 列出路径和大小。

双版 Electron 存储夹具的临时目录 `dshu-electron-coexist-native-3kmre543.yxc` 的递归清理被自动审批以 `blocked by policy` 拒绝。目录与验收回执保留，拒绝记录为 `20261118/windows-electron-coexist-cleanup-rejected.json`。

本轮已停用的独立打包工作区 `D:/DSHU-Delivery-Work/20261118/source-fc4c9ddf7b` 中，仅维护私有 `.desktop-build/pnpm-store`：移除 49,468 文件、1,125 包，D 盘净空闲增加约 1.28 GiB。回执为 `20261118/private-store-prune-result.json`。没有重试下列拒绝目标，也没有清理它们的父目录。

11 月 18 日失败的 Client 编译误写了 `packages/client/ui-file-actions/src/` 下 20 个未跟踪的编译文件，项目引用已修复。原清理请求的自动审批拒绝记录保存在 `20261118/proxy-export-compiler-residue-rejected.json`。当前工作区已无这些派生文件。

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

Windows 18.6 的旧 `win-unpacked` 目录包含 16,415 个文件，占 1,590,425,409 字节。核对了保留的恢复安装器和四个载荷文件的摘要，未发现链接或活动进程引用。自动审批以 `blocked by policy` 拒绝递归删除，目录保留。回执位于 20261118 交付目录的 `windows-18-6-unpacked-cleanup-audit.json` 和 `windows-18-6-unpacked-cleanup-rejected.json`。

继续时读取 TODO 并核对实际工作树与安装版本。保持 main、中文提交、正常 Git hooks，不使用 Computer Use。进阶目标保护和所有限额默认关闭；保护按域名/主机规则、服务器/数据库、审计联动顺序推进。

</details>
