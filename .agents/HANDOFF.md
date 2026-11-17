# DSHU 开发交接

**本地 2026.11.17.6 已保留数据安装并启动，没有发布 Release，Goal 保持活动。** 公开预发布仍为 17.5。当前 36 项完成、9 项进行中及 3 项未来计划，完整范围见 [TODO](TODO.md)。用户要求继续实现并减少过度测试；发布须逐次取得明确许可。

## 当前交付

本地 17.6 构建源码 `5c61ab10355999bc7fcde463e0e72d2fbc271f54`，显示/内部版本 `2026.11.17.6` / `2026.1117.6`，提供 Windows exe、Linux deb/tar.gz，未签名。两平台实际模块、Windows 安装及启动已核验。[本地交付](requirements/2026-11-17.6-delivery.md)

[17.5 Release](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5) 是现有公开预发布，ID `448298712`，源码 `7a5d82454a`。本次没有修改它、创建新 Release 或上传资产。

Windows 无脚本暂停 Frida 会话在关闭前复用现有流程完成空脚本初始化，再卸载、恢复和分离。保留 REA 6.9.0 与 Frida 17.23.2，两平台真实包各两项通过，包含连续三个无脚本暂停目标，目录清理成功。管理器 SHA-256 `7d6fa8fca95b7168cdbc629d7a717d597845de3ce4e42793076471ff7d0666ea`。[修复说明](requirements/2026-11-17-frida-prime-close.md)

17.25.1/17.26.4 原生绑定候选没有采用，目录清理失败证据保留。不要重新升级候选或把其结果当作成功。[对照记录](requirements/2026-11-17-frida-version-qualification.md)

余额精度及 Frida 修复沿用既有有效证据。17.6 实装 API、四模式、旁问、删除和受控命令通过，Linux 归档/API 通过；新模块均在实际包内核验，没有重复整轮界面或 Frida 目标回归。完整进阶保护、实体平台、签名自动升级及许可材料继续保留未验收状态。

## 恢复与运行

- 备份 `D:/DSHU-Backups/20261117T125315Z-before-20261117-6-data`：7,362 文件、0 链接，安装后摘要一致；官方 DSH 两个关键文件未变。恢复前另存当前数据。
- 回退包为 17.5，摘要 `0d1c59e1b12c5f3cec812d493fd54a31f7ecc51851a6db2d14973cc440bb9fb7`。本版材料为 `%USERPROFILE%/DSHU-Deliveries/20261117/candidate-2026.11.17.6`；Linux 文件在 `D:/DSHU-Deliveries/20261117`。
- 常规启动主 PID `19064`，直接验证用户令牌未提权，观察期间五个进程响应且无新增崩溃。操作前重新核对进程。旧主进程明确终止，不能记作正常退出验收；不要求新进程的父进程仍然存活。
- 主要回执：`installed-update-result.json`、`installed-runtime-result.json`、`normal-launch-17-6-result.json`、`current-development-checkpoint.json`。历史源码、失败记录、stash 和备份保留。

## 本版增强与后续范围

[SSH 资源匹配回执](requirements/2026-11-17-ssh-resource-receipts.md)已随本地 17.6 交付。客户端和 helper 使用协议 4，需配套部署并更新固定摘要；原始 Session 录制和持久化字段未改动。

[PostgreSQL/MySQL 资源关联](requirements/2026-11-17-database-resource-bindings.md)已随本地 17.6 交付，配置与兼容变化在包内迁移指南中。`resourceIds` 默认空列表；未知生产路径不能通过未关联绑定绕过。实际数据库引擎、物理数据文件身份及完整平台验收继续保留。

## 工作约束

保持 main、中文提交及正常 hooks，不使用 Computer Use。用户已明确要求：创建 GitHub Release、上传发布资产及公开发布须逐次取得许可；继续开发、本地打包及代码推送不视为发布许可。已公开的 17.5 保留，不擅自修改。安装和重启 DSHU 的既有授权保留；没有授权签名或重启系统。Goal 继续活动，不沿用此前已经履行的暂停指令。

高级保护和所有限额默认关闭，输入预测开启，余额默认 15 秒/最小 3 秒，关闭旁问自动清理关闭，`/clear` 仅旁问可用。macOS ARM、Android＋Fedora PRoot 和全新安装器本轮不开发。

Windows 构建使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`。私有 `.env.windows` 使用 npm 官方 registry；代理下载失败后，仅在本次进程中清除代理变量直连成功。供应链检查未放宽。首次 pnpm 烟测超时后，同一运行时独立检查通过；后续成功 run 见交付记录。

## 清理与工作约束

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
