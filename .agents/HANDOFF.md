# DSHU 开发交接

**2026.11.17.4 已公开预发布、保留数据安装并启动。** 用户在 17.4 发布暂停后已恢复 Goal，要求继续推进到可发布；完整目标不标为完成，现有 36 项完成、9 项进行中及 3 项未来计划保留在 [TODO](TODO.md)。用户要求停止过度测试，继续时只补必要功能与有实际依据的检查。

## 当前推进

Windows 未初始化暂停目标关闭已有更小的源码修正，保留 Frida 17.23.2；Windows/Linux 各两项通过，包含各自连续三个无脚本暂停目标，16 项补丁暂存检查通过。尚未改动安装版，下一版核对管理器 SHA-256 `7d6fa8fca95b7168cdbc629d7a717d597845de3ce4e42793076471ff7d0666ea` 并完成实际包复核。[修复记录](requirements/2026-11-17-frida-prime-close.md)

文档与仓库整理已按 17.4 结项；默认/唯一分支 main、开放 PR 零、两个预发布与资产来源一致，安全扫描与自动更新设置已读取确认，没有改设置。[记录](requirements/2026-11-17-repository-release-check.md)

Frida 17.25.1 与 17.26.4 的暂停目标用例通过，但附加场景的私有目录清理仍失败；未升级锁文件或安装版。已保留原始错误与清理错误，诊断不再以覆盖的异常作结论。继续定位占用或取得对应修复，并推进独立发布项目；避免重复无信息增量的测试。[版本对照](requirements/2026-11-17-frida-version-qualification.md)

## 最新更新

余额历史精度修复已随 **2026.11.17.4** 公开预发布、安装并正常启动；以下 17.3 材料保留为前置版本证据。当前源码 `be3bce8fc74556fc70b1b36dd2cf22e6bb88ffd3`，当前显示/内部版本为 `2026.11.17.4` / `2026.1117.4`。[17.4 发布](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.4) · [交付](requirements/2026-11-17.4-delivery.md)

当前备份为 `D:/DSHU-Backups/20261117T041647Z-before-20261117-4-data`，7,354 文件、0 链接，安装后摘要一致；回退包为已保留的 17.3。主 PID `152932`、Host `125904` 于北京时间 12:25 启动，观察期无新崩溃。操作前重新验证身份。17.4 实装三个悬浮位置的金额与区间差值通过；测试夹具只注入私有浏览器响应，没有改用户数据。

三份发布资产与 SHA256SUMS.txt 已核对远端摘要。当前材料在 `candidate-2026.11.17.4`，发布回执 `release-17-4-publish-retry.json`；用户要求在本次发布收尾后暂停 Goal。17.3 已知限制保持记录，不将完整目标标为完成。

## 当前交付

[GitHub Release](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.3) 已发布，ID `448021189`，标签 `v2026.11.17.3`；未签名公开预发布，提供 Windows x64 exe、Linux x64 deb/tar.gz 和 SHA256SUMS.txt，所有远端摘要与本地一致。[交付记录](requirements/2026-11-17.3-delivery.md)

构建源码 `e31577def4e7e0eff5441d27a1f4ea04a6336046`，显示/内部版本 `2026.11.17.3` / `2026.1117.3`，DSH `0.2.2-rc.3`，REA `6.9.0` 加固定关闭顺序补丁。运行时、四模式、旁问、删除、命令和主要界面通过实装检查；Linux 归档与 Wayland 通过。本轮没有重跑完整 Web 基线。

中央文件映射、请求审计和未交付流清理已随包。Windows Frida 附加/卸载/重置通过，但暂停启动目标关闭后仍偶发存活；Linux 本批两个用例通过。不要把之前的隔离对照当作缺陷已完全修复，发布说明已记录限制。失败自建进程已按确切身份清理。[Frida 记录](requirements/2026-11-17-frida-close-release.md)

用户已批准两个冻结指南链接例外；仅 URL 及配对记录改变，迁移步骤不变，全仓 2,356 份文档链接通过。Windows 919 包中 6 项、Linux 921 包中 8 项许可材料仍待核查，完整进阶保护、实体平台、签名自动升级等未验收项继续保持事实状态。

## 恢复与运行状态

- 备份 `D:/DSHU-Backups/20261117T032827Z-before-20261117-3-data`，7,350 文件、0 链接，安装后逐项摘要一致；官方 DSH 两个关键文件未变。恢复前另存当前数据。
- 回退安装器保留为 `2026.11.17.1`，SHA-256 `6adf3f7d2ccc7f6c62b1e85fdb1c0fe0e0de04f4791ee39fef19931dbd5437cf`。
- 正常用户 DSHU 于北京时间 11:36 启动，主 PID `138520`、Host PID `147976`，窗口响应、观察期无新崩溃。后续操作前重新验证进程路径和启动时间；旧主进程终止不是正常退出验收。
- 交付材料为 `%USERPROFILE%/DSHU-Deliveries/20261117/candidate-2026.11.17.3`；公开回执 `release-17-3-published.json`，安装回执 `installed-update-result.json`，当前状态 `current-development-checkpoint.json`。Linux 包在 `D:/DSHU-Deliveries/20261117`。
- Windows、Ubuntu 私有检出均保留历史 stash；Ubuntu 源码已同步到本版构建提交。先前备份与恢复安装器不删除。

## 工作约束

保持 main、中文提交和正常 hooks，不使用 Computer Use；用户已授权本次公开发布和安装，未授权签名或系统重启。用户已恢复开发，当前保持 Goal 活动。macOS ARM、Android＋Fedora PRoot及新安装器仍属于用户明确的未来计划。

默认高级保护与全部限额关闭，输入预测开启，余额 15 秒/最小 3 秒，关闭旁问自动清理关闭，`/clear` 只在旁问可用。原保护范围与编号不删除、不转为已完成。

本机 Windows 构建使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`。镜像/代理故障后，私有 `apps/desktop/.env.windows` 的 registry 改为 `https://registry.npmjs.org`，只改这一行；GitHub REST 上传在进程内清除代理后成功。未修改系统代理或供应链校验。最终构建 run 见交付记录。

## 清理与工作约束

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
