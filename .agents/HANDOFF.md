# DSHU 开发交接

**本地 2026.11.18.10 已保留资料安装并启动。** 当前 36 项完成、9 项进行中及 3 项未来计划。[开发清单](TODO.md)

## 当前交付

当前 Windows 构建源码 `b11c63786f8b6f0e8dff8ed37fd0df7b1e2f99b4`，显示和内部版本分别为 `2026.11.18.10` 和 `2026.1118.10`。本版修复启动描述校验和许可文件写入。原位更新核对 7,424 个资料文件、实装载荷和启动。[交付与恢复](requirements/2026-11-18.10-delivery.md)

已交付流量 JSON 导出、连接切换及请求竞态修复、可选保护缺失提示。四个正式 npm 提供方完成 rc.3 → rc.4 升级及实际注册，四模式就绪，无 Host 加载警告。CLI 升级不运行依赖构建脚本，不调用模型账号，应用 ASAR 和升级前测试 patch 不变。

18.1 rc.3 候选已验证但未安装；17.7 失败候选仍隔离保留。检查实际外部插件导入 SDK client 和注册情况，不能只以包内文件存在代替运行通过。[历史 18.1](requirements/2026-11-18.1-delivery.md) · [历史 17.8](requirements/2026-11-17.8-delivery.md)

[公开预发布 17.5](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5) 保持不变。本次没有创建 Release、修改公开资产或上传文件。源码已经推送；远端没有 CI 运行记录，不能记作 CI 通过。

## 当前开发

保护文件监听的原生触发与规则撤销见 [Windows 18.3 实包记录](requirements/2026-11-18.3-delivery.md)。rc.4 的 Linux 新包及实体机图形和门户验收仍待进行。其余保护执行、资源物理身份、关机/重启、发行与许可证事项继续按完整清单推进。内核和界面改动的边界及验证见 [rc.4 适配](requirements/2026-11-18-dsh-rc4.md)与[可选运行时反馈](requirements/2026-11-18-optional-runtime-feedback.md)。

## Linux 测试与 WSL 状态

后续 Linux 测试转到用户指定的 Fedora 45 x86_64 实体设备，通过既有 Windows SSH 跳板的 `fedora` 别名访问。连接和部署信息在 `%USERPROFILE%/DSHU-Deliveries/20261118/linux-test-connection.json`；CLI、版本身份和 SDK 导入已经通过，图形界面与门户尚未验收。18.7 的依赖安装和 Frida 官方预构建核验已通过。打包预检因缺少 `musl-gcc` 退出。已校验私有工具链的源归档，按用户安排等设备晚上上线后继续打包和原生桌面验收。[设备与回收记录](requirements/2026-11-18-linux-test-host.md)

本机 WSL 的 DSHU 专用缓存已经归档并清理，文件系统净增加约 153.2 GiB 空闲。三个工作区及 32 条 stash 已验证可恢复，备份在 `%USERPROFILE%/DSHU-Backups/20261118-wsl-retirement/`，恢复时须同时保留归档和 `borrowed-objects/`。旧 `/home/linzh/.cache/dshu-verification` 路径已移除，不再启动本机 WSL 或调用旧 Linux 构建脚本。

VHDX 实测从约 203.9 GiB 降至 50.7 GiB。北京时间 17:22 和 18:36 均未发现 WSL 虚拟机进程，18:36 的 `WslService` 为 `Stopped`。此前提权任务已退出且未返回压缩回执。Codex 的重连设置尚未操作。[Windows 磁盘与内存收尾](requirements/2026-11-18-linux-test-host.md#windows-磁盘与内存收尾)

## 恢复与运行

18.10 的安装器、资料备份和 18.9 恢复步骤见[本地交付记录](requirements/2026-11-18.10-delivery.md#安装包与恢复)。Linux 已验证归档为 17.8。

Windows 配置恢复已用实装载荷和独立资料验证。证据与测试替代范围见[启动时的配置恢复](requirements/2026-11-18.9-delivery.md#启动时的配置恢复)。

## 仍有效的执行验收

Windows 18.2 的本地文件保护冷重启通过：完全保护拒绝读写、审计只读、测试写入和清空规则后的新写入均由实际提供方执行并独立回读。规则修订 2 与 27 条审计在新 Host 保留。没有改用户配置，不代表系统重启或远端/数据库冷重启，见[记录](requirements/2026-11-18-protection-cold-restart.md)。

[SSH 资源匹配回执](requirements/2026-11-17-ssh-resource-receipts.md)和[数据库资源关联](requirements/2026-11-17-database-resource-bindings.md)已随本地 17.6 交付并保留在本包。SSH 客户端/helper 使用协议 4，需配套部署和更新固定摘要；持久化字段及原始 Session 录制未改变。

[PostgreSQL 16.15 与 MySQL 8.0.46](requirements/2026-11-17-native-database-engines.md)共 14 个实际引擎场景通过，含独立数据回读、存储重开及正常退出。远端物理身份、其他协议与实体平台仍按 TODO 保留范围，不重复这轮引擎验收。

[Frida 关闭修复](requirements/2026-11-17-frida-prime-close.md)保留 REA 6.9.0、Frida 17.23.2，两平台自有目标证据继续有效。管理器摘要 `7d6fa8fca95b7168cdbc629d7a717d597845de3ce4e42793076471ff7d0666ea` 已在本包核对；17.25.1/17.26.4 未采用，不把失败候选当作成功。

## 工作约束

保持 main、中文提交及正常 hooks，不使用 Computer Use。用户已明确要求：创建 GitHub Release、上传发布资产及公开发布须逐次取得许可；继续开发、本地打包及代码推送不视为发布许可。已公开的 17.5 保留，不擅自修改。安装和重启 DSHU 的既有授权保留；没有授权签名或重启系统。Goal 继续活动，不沿用此前已经履行的暂停指令。

高级保护和所有限额默认关闭，输入预测开启，余额默认 15 秒/最小 3 秒，关闭旁问自动清理关闭，`/clear` 仅旁问可用。macOS ARM、Android＋Fedora PRoot 和全新安装器本轮不开发。

Windows 构建使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`。私有 `.env.windows` 使用 npm 官方 registry；代理下载失败后，仅在本次进程中清除代理变量直连成功。供应链检查未放宽。首次 pnpm 烟测超时后，同一运行时独立检查通过；后续成功 run 见交付记录。

## 清理与工作约束

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
