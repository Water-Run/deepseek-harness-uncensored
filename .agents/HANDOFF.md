# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 34 项完成、11 项进行中，另有 3 项未来计划。实际剩余额度达到 1% 时按用户规则收尾；最近实查剩余 14%。Windows x64 优先，Linux x64 同步；macOS、Android＋Fedora PRoot、全新安装器本轮不开发。

## 当前交付

| 项目 | 已核对状态 |
| --- | --- |
| 产品版本 | `2026.11.16.1`；内部版本 `2026.1116.1` |
| 构建源码 | `f8c87121c7184df3835225d71e6afd1619f54c08`，干净工作树；后续文档提交不改变这份产物 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| Windows x64 | 已保留数据安装并启动，关于、CLI、文件资源与卸载登记一致 |
| Linux x64 | deb/tar.gz、CLI/API、隔离 X11/Wayland 主界面、重载与沙箱通过 |
| 发行状态 | 未签名检查包；正式签名、在线升级、许可审查与完整平台验收未完成 |

Windows 安装包和回执位于 `%USERPROFILE%/DSHU-Deliveries/20261116`；Linux 归档位于 `D:/DSHU-Deliveries/20261116`。文件名包含产品版本、内核、REA、平台和源码短提交。[打包规则](../apps/desktop/packaging/README.zh.md)

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `e3cb128381364e4ea78dc2ceae66c5ebb292bb361b32138f357657eb4845b6a2` |
| Linux x64 tar.gz | `6f1dac6abd24d91f20ea5f6aadb623a89b36f0ceac378c5b5046a61c3b2a331e` |
| Linux x64 deb | `b2c16511cf448d44109f64896ff77ddfb468c0497d8dc601e23749098f35755e` |

## 本轮验收

- 四模式中英文指南各七节、每种三组任务示例，保留模式色并补入准备材料与交付检查。Windows 实装逐一核对七节、三组示例与焦点恢复；337 项模式单测、8 组浏览器布局组合通过，实际截图已检查。[指南](requirements/2026-11-15-mode-guides.md)
- Windows 安装前后 7,318 个用户文件及官方 DSH 两份关键文件摘要一致；CLI、四模式、新会话、受控命令、旁问重开/清理及主旁删除通过。重开弹窗同时位于视觉和焦点前台，且复用了同一 DOM 节点；星期控件在 1280/800px 无横向溢出。
- 两平台实际产物通过 REA 255 项目录与 JavaScript 分析、Office 文档往返、PDF/图像转换与重算、CLI 离线插件安装卸载和长路径终端检查。未调用付费模型。
- Linux deb/tar.gz 的 ASAR 与可执行文件摘要一致；实际归档在隔离 X11/Wayland 中通过主界面、默认工作区和重载，renderer 保留 seccomp 与 NoNewPrivs，未使用 `--no-sandbox`。本轮原生探测的控制台和失败响应列表为空；这不代替原生门户、实体桌面或正式更新验收。旧版的 GitHub 403 记录仍保留。
- npm 声明仍有 Windows 919 包中 7 项、Linux 921 包中 9 项待核查；补充原文与摘要已在实包中核对。不能将可运行解释成许可审查完成。

## 当前完整 Web 基线

`web-baseline-5` 以 `f8c87121c7` 干净源码重新构建后运行：3 组前置共 10 项通过；主批次 1,072 通过、3 项测试失败、34 跳过，另有 2 个准备/收尾失败文件，共 5 个失败文件；最终工作树干净。[后续记录](requirements/2026-11-16-regression-followup.md)

后续源码已补齐菜单锚点裁切后的关闭和生命周期、目录稳定排序、终端创建就绪及 PTC 显式测试组合。Linux 六文件 42 项只读回归、Windows 25 项菜单/翻译检查通过；完整 GUI 的 4 个既有失败已修正，并以 172 项定向检查复验。当前安装版不包含这些源码修改。[批次 V](requirements/2026-11-16-regression-followup.md#批次-v菜单裁切与回放稳定性源码未打包)

下一步处理：

1. 完成 Worker 的真实 SQLite 接入及完整预览。导入与 Fetch 候选仍未提交；保持额度守卫拒绝付费请求。
2. 适时重跑同一提交的完整 Web，保留本轮基线，不将定向通过代替整轮通过。
3. 两个额外 Windows POSIX 日志比较含原生 ACL 技能和部分文件沙箱披露差异；行为断言通过，完整比较未通过，不能删除平台披露凑通过。
4. 继续 TODO 的平台、发行、许可及默认关闭的进阶保护验收。本轮不开发未来三个平台/安装器计划。

此前 `web-baseline-4` 的 1,073 通过、12 失败及各批定向结果继续保留，不能用本轮或后续通过覆盖旧失败。[历史回归](requirements/2026-11-15-regression-baseline.md)

## 工作树与恢复入口

- Windows Worker 的 11 份候选文件已从 stash 恢复并逐文件核对原始字节。备份位于 `20261116/worker-preview-before-20261116-1.{zip,json,patch}`，stash `a9921e56af9277a9e3917031a7052dc298ba8c29` 继续保留。不要 reset 或覆盖；它们未包含在本检查包中。
- SQLite 官方 WASM `3.54.1-build1` 已在隔离探测中验证真实事务、回滚、FTS5、精确 int64 和现有 SpendLedger 的预留/结算/拒绝/逐项重置/过期。证据在 `20261116/worker-sqlite-probe/`。仅验证内存库，未接入浏览器 VFS、生命周期或产品，不能标为完成。
- Ubuntu 已迁移到 `D:/WSL/Ubuntu`，可正常使用。私有检出 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source` 当前为 `f8c87121c7`；迁移前的 8 份候选保存在 `20261115/web-baseline-5/` 的 tar、patch、摘要及 `stash-commit.txt`，不要重新覆盖已提交修正。完整 WSL 备份在 `D:/Codex-disk-relief/ubuntu-pre-migration-2026-11-15/ubuntu-backup.tar`。
- 当前安装前数据：`D:/DSHU-Backups/20261115T172839Z-before-20261116-1-data`，7,318 文件已校验，权限限当前用户、SYSTEM 和管理员。
- 上一版恢复安装器：`20261115/DSHU-2026.11.15.9-core-0.2.2-rc.3-REA-6.9.0-win-x64-857695d.exe`，SHA-256 `a7d9f233180d022c33199931e8a276f4e09fcae15fc84658f7f7f604c6b15011`，安装前再次核对。`.8` 程序备份及更早回执保留，自动回退尚未验收。
- 当前回执：`current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`、`linux-native-x11-16-1-startup.json`、`linux-native-wayland-16-1.json`。均在 `20261116` 交付目录。

## 后续范围与工具链

继续 [TODO](TODO.md) 的 11 项：完整 Web、门户/实体平台、远端与商业引擎、默认关闭的进阶保护及审计、自动回退、重启、正式更新与依赖审查。保护按域名/主机规则、服务器/数据库、审计联动的顺序推进；原生 Cua Driver 保护目前只通过源码验收，未进入当前产品组合。[执行层](requirements/2026-11-02-native-execution.md)

当前机器默认 MSVC `14.51.36231` 缺少对应 Spectre 库，预检会拒绝；已实查 `14.52.36629` 组件齐全，以 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true` 通过完整打包。没有绕过 Spectre 检查，也没有安装或移除系统工具。保留失败与成功的 preflight 日志，后续先核对实时工具集。

保持 main、中文提交并正常推送，不使用 Computer Use。进阶保护与全部限额默认关闭，输入预测默认开启，余额默认 15 秒且最小 3 秒，旁问关闭清理默认关闭，`/clear` 只在旁问中可用。

## 清理与工作约束

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
