# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 35 项完成、10 项进行中，另有 3 项未来计划。实际剩余额度达到 1% 时按用户规则收尾；最近实查剩余 8%。Windows x64 优先，Linux x64 同步；macOS、Android＋Fedora PRoot、全新安装器本轮不开发。

## 当前交付

| 项目 | 已核对状态 |
| --- | --- |
| 产品版本 | `2026.11.16.2`；内部版本 `2026.1116.2` |
| 构建源码 | `668ec5146dfbfdcf03becae372156b78d71c509a`，干净工作树；后续文档提交不改变这份产物 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| Windows x64 | 已保留数据安装并启动，关于、CLI、文件资源与卸载登记一致 |
| Linux x64 | deb/tar.gz、CLI/API、隔离 X11/Wayland 主界面、重载与沙箱通过 |
| 发行状态 | 未签名检查包；正式签名、在线升级、许可审查与完整平台验收未完成 |

Windows 安装包和回执位于 `%USERPROFILE%/DSHU-Deliveries/20261116`；Linux 归档位于 `D:/DSHU-Deliveries/20261116`。文件名包含产品版本、内核、REA、平台和源码短提交。[打包规则](../apps/desktop/packaging/README.zh.md)

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `329fcf84bc14dae179fb17cec1e3a83ef4cad3ba21d4ee8a02b9820b58ab973b` |
| Linux x64 tar.gz | `02c5909ca9ac9bacfc8787d67367e3306325adc991c6a5a87aa6ad8169f6adfa` |
| Linux x64 deb | `6c5d68a0aaef255a1851d6ed8fbfe6995da4d3b1ba81b2944735408b800c6b4e` |

## 本轮验收

- Host 原生退出新增 PID、原始/十六进制状态、信号及关闭状态的诊断。Windows/Linux 定向回归通过，受控实际进程验证了 `0x40010004` 与 SIGTERM；原先用户配置的异常原因仍未知。该改动等待下一版检查包。[记录](requirements/2026-11-06-stability.md#host-原生退出事实2026-11-16)

- Frida 在 Windows 已安装版及 Linux `.16.2` 实际归档中通过附加、注入、卸载、关闭、重置及释放验收。Linux 目标显式允许测试父进程及其后代调试，系统 ptrace 设置未改；两组独立进程并发通过，未授予许可的负对照因真实权限拒绝失败。其他目标与引擎继续按原清单验收。[记录](requirements/2026-11-06-stability.md#linux-frida-附加与回收2026-11-16)

- 交付包之后另补 `experimental-inspector/protected` 源码：保护组合在 Worker 创建前拒绝任意 Host 调试，规则全关时也明确报告不可用；只读 Session Inspector 保留。真实 CDP 测试证实关闭 Worker 后 Host 回调仍执行，因此未采用撤销原型。源码、完整构建与实际组件解包入口验收通过，安装中的 `.16.2` 不包含新入口。[记录](requirements/2026-11-02-native-execution.md#inspector-调试准入2026-11-16源码)

- 四模式中英文指南各七节、每种三组任务示例，保留模式色并补入准备材料与交付检查。Windows 实装逐一核对七节、三组示例与焦点恢复；337 项模式单测、8 组浏览器布局组合通过，实际截图已检查。[指南](requirements/2026-11-15-mode-guides.md)
- Windows 安装前后 7,323 个用户文件及官方 DSH 两份关键文件摘要一致；CLI、四模式、新会话、受控命令、旁问重开/清理及主旁删除通过。重开弹窗同时位于视觉和焦点前台，且复用了同一 DOM 节点；星期控件在 1280/800px 无横向溢出。新版已启动供用户检查。
- 两平台实际产物通过 REA 255 项目录与 JavaScript 分析、Office 文档往返、PDF/图像转换与重算、CLI 离线插件安装卸载和长路径终端检查。未调用付费模型。
- Linux deb/tar.gz 的 ASAR 与可执行文件摘要一致；实际归档在隔离 X11/Wayland 中通过主界面、默认工作区和重载，renderer 保留 seccomp 与 NoNewPrivs，未使用 `--no-sandbox`。两份原生探测均记录 GitHub 发行 API 403，不能称为控制台或网络全绿；门户、实体桌面和正式更新验收继续保留。
- npm 声明仍有 Windows 919 包中 6 项、Linux 921 包中 8 项待核查；clean-git-ref 的归属与实装复核已进入本包，补充原文及摘要按实包核对。不能将可运行解释成许可审查完成。

旧版退出时 Restart Manager 返回 351，安装尚未开始。随后仅终止已核验的界面主进程，Host 按既有 IPC 断连流程收尾并以 0 退出，确认所有 DSHU 进程结束后再备份与安装；没有直接结束 Host 或重启系统。失败和实际退出回执分别保留在候选目录的 `stopped-before-update-rm-failed.json`、`interface-disconnect-result.json`。

真实用户配置在北京时间 7:40 另有一次 Host 异常退出，码为 `1073807364`（`0x40010004`），界面写出了 host 崩溃记录；用户记不清是否曾主动结束进程，原因未定，不能据退出码认定具体终止方。随后受控重启的 Host 通过 IPC 断连以 0 收尾，再经 Explorer 启动的界面 PID `100748`、Host PID `128708` 已观察 9 分钟仍存活，未新增崩溃记录，不将短时未复现写成修复完成。继续前重新核对这些 PID 的实际身份；不得据旧 PID 结束进程。证据为 `user-app-explorer-launch.json`、`user-app-explorer-job-inspection.json` 和用户日志 `crash-2026-11-15T23-40-53-971Z-host.log`。

## 当前完整 Web 基线

`web-baseline-7` 以交付源码 `668ec5146d` 干净构建后运行：3 组前置 10 项、主批次 1,077 项通过，32 项条件跳过，无失败文件，退出 0，最终工作树干净。全部 JSON 和原始日志位于 `20261116/web-baseline-7/`。[后续记录](requirements/2026-11-16-regression-followup.md)

菜单锚点裁切、目录稳定排序、终端创建就绪和 PTC 显式测试组合已随本包交付。Linux 六文件 42 项、Windows 25 项定向检查及 GUI 的 172 项修复复验继续保留，原完整 GUI 的四个失败不被删去。[批次 V](requirements/2026-11-16-regression-followup.md#批次-v菜单裁切与回放稳定性源码未打包)

README 恢复四模式配色，新增[中英文使用手册](../docs/user/guide/dshu.zh.md)及离线索引，涵盖首次任务、上下文、费用、记忆、工具、默认值和排错；Web 入门页已纠正必须选择工作区才能发送消息的过期说明，相关文件已包含于交付源码。

Worker 的真实 SQLite 接入与完整浏览器预览已通过；保持初始化/存储失败时的额度拒绝，不将单 Worker 账本解释为跨 Worker 或浏览器重启持久化。[批次 W](requirements/2026-11-16-regression-followup.md#批次-wworker-sqlite-与完整预览源码未打包)

日期版本辅助函数和 MCP 关闭状态的 11 条 JSDoc 违规已清理；仅调整接口说明，`export-jsdoc-complete.log` 显示全仓无违规，不改变运行行为。

下一步处理：

本次完成退出诊断源码节点后，准备同版本矩阵 `2026.11.16.3` 的未签名检查包并核对安装；构建状态放在交付目录 `package-16-3-status.json`，构建时不得改工作树。当前实际交付和安装仍为表中的 `.16.2`。

1. 继续观察真实用户配置的 Host 退出。GitHub 403 补充原生探测已返回 200、49 次剩余额度和空发行列表，失败响应为零；原失败时段未捕获正文，原因仍不作确定归因。新增原生回执保存在 `candidate-2026.11.16.2/linux-native-wayland-16-2-diagnostic.json`，不覆盖原 403 证据。
2. 两个额外 Windows POSIX 日志比较含原生 ACL 技能和部分文件沙箱披露差异；行为断言通过，完整比较未通过，不能删除平台披露凑通过。
3. 继续 TODO 的 10 项平台、发行、许可及默认关闭的进阶保护验收。本轮不开发未来三个平台/安装器计划。

旧 `web-baseline-6` 的 PTC 提示词收尾失败保留原记录；仅补齐当前组合的可读 sidecar，所有原始 Session、writer、工具 schema、工作区和 UI 预期不变。修复后的两项只读重放、三项语料检查及最终整轮均已通过。先前句柄 `20412`、`45006` 及两平台打包、验包、安装验证作业均已终止，不据旧状态文件重启。

此前 `web-baseline-4` 的 1,073 通过、12 失败及各批定向结果继续保留，不能用本轮或后续通过覆盖旧失败。[历史回归](requirements/2026-11-15-regression-baseline.md)

## 工作树与恢复入口

- Windows Worker 的原始候选备份位于 `20261116/worker-preview-before-20261116-1.{zip,json,patch}`，stash `a9921e56af9277a9e3917031a7052dc298ba8c29` 保留用于对照。候选已合并并随 `.16.2` 交付，不以旧备份覆盖当前源码。
- SQLite 官方 WASM `3.54.1-build1` 已接入 Worker VFS 与生命周期并随本包交付。运行时及许可声明 46 文件 728 项单测、真实账本集成、10 项构建及完整预览通过；早期探测与失败仍在 `20261116/worker-sqlite-probe/` 和[批次 W](requirements/2026-11-16-regression-followup.md#批次-wworker-sqlite-与完整预览源码未打包)。
- Ubuntu 位于 `D:/WSL/Ubuntu`，私有检出 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source` 当前为 `668ec5146d`。更新前 11 份文件的 tar、patch、摘要在 `20261116/web-baseline-6/`，stash `faee5b828ba8a877026376f96e41777df8fbe5ac` 保留；已复验提示词的独立备份及 stash 记录在 `web-baseline-7/`。迁移前八份候选与完整 WSL 备份继续保留，不覆盖已提交修正。
- 当前安装前数据：`D:/DSHU-Backups/20261115T231734Z-before-20261116-2-data`，7,323 文件已校验，权限限当前用户、SYSTEM 和管理员。
- 上一版恢复安装器：`20261116/DSHU-2026.11.16.1-core-0.2.2-rc.3-REA-6.9.0-win-x64-f8c8712.exe`，SHA-256 `e3cb128381364e4ea78dc2ceae66c5ebb292bb361b32138f357657eb4845b6a2`，恢复前核对摘要。原 `.16.1` 回执在 `accepted-2026.11.16.1/`，更早备份保留，自动回退未验收。
- 当前回执：根目录的 `current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`；候选目录的 `candidate-2026.11.16.2/linux-native-x11-16-2-startup.json`、`linux-native-wayland-16-2.json`。均在 `20261116` 交付目录。

## 后续范围与工具链

继续 [TODO](TODO.md) 的 10 项：门户/实体平台、远端与商业引擎、默认关闭的进阶保护及审计、自动回退、重启、正式更新、仓库整理与依赖审查。保护按域名/主机规则、服务器/数据库、审计联动的顺序推进；原生 Cua Driver 保护目前只通过源码验收，未进入当前产品组合。[执行层](requirements/2026-11-02-native-execution.md)

当前机器默认 MSVC `14.51.36231` 缺少对应 Spectre 库，预检会拒绝；已实查 `14.52.36629` 组件齐全，以 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true` 通过完整打包。没有绕过 Spectre 检查，也没有安装或移除系统工具。保留失败与成功的 preflight 日志，后续先核对实时工具集。

保持 main、中文提交并正常推送，不使用 Computer Use。进阶保护与全部限额默认关闭，输入预测默认开启，余额默认 15 秒且最小 3 秒，旁问关闭清理默认关闭，`/clear` 只在旁问中可用。

## 清理与工作约束

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
