# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 35 项完成、10 项进行中，另有 3 项未来计划。账号周期已重置，最近成功实查剩余 98%；确认达到 1% 时仍按用户规则收尾并暂停。Windows x64 优先，Linux x64 同步；macOS ARM、Android＋Fedora PRoot、全新安装器本轮不开发。

## 当前交付

| 项目 | 已核对状态 |
| --- | --- |
| 产品版本 | `2026.11.16.4`；内部版本 `2026.1116.4` |
| 构建源码 | `089dbb9b49b9c201ec9f955e321efcd5b52699ff`，两平台构建时工作树干净 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，发布标签对应 `d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| Windows x64 | 已保留数据更新，安装后 API、CLI、模式、旁问、删除、限流显示及自建目标 Frida 通过；新版已启动供检查 |
| Linux x64 | deb/tar.gz、归档、API、双语 Web 和隔离 X11/Wayland 启动与重载通过；实包 Frida 两项通过 |
| 发行状态 | 未签名检查包；正式签名、在线升级、许可与完整平台验收未完成 |

Windows 产物位于 `%USERPROFILE%/DSHU-Deliveries/20261116`，Linux 归档位于 `D:/DSHU-Deliveries/20261116`。版本、摘要、验证与限制见[本版交付记录](requirements/2026-11-16.4-delivery.md)。最新已发布 DSH 及 REA 已核对；REA 主分支另有未发布变更，未纳入本包。

## 本轮验收

- 更新检查区分明确限流和普通 403，保留冷却，关闭重开不能绕过，到期只启用手动检查。Windows/Linux 各 28 项所属回归、各两项双语 Web 场景通过。实际安装资源的 429 显示和禁用检查通过。旧 403 原因仍未知。[记录](requirements/2026-11-16-release-check.md)
- 安装前仅结束核实后的旧界面进程，Host 依 IPC 断连清理，以 0 退出，再确认安装目录下进程全部结束。原有 7,342 个数据文件摘要及官方 DSH 两份关键文件一致，没有系统重启或直接结束 Host；这不等于完整正常退出验收。
- Windows Edge 158 检查四模式指南、关于页及 1280/800px 星期布局；普通与限流探测的弹窗前台和焦点通过，节点保留观测分别为 true/false，不承诺 DOM 身份。实际 `.16.4` 的 Frida 两平台各两项通过，只操作自建目标。
- Linux 两种归档的 ASAR 与执行文件摘要相同。实际归档在私有 X11/Wayland 中通过默认工作区、主界面与重载，renderer 保留 seccomp 和 NoNewPrivs，没有使用 `--no-sandbox`。物理桌面和门户继续待验收。
- Inspector 可选拒绝入口随包分发，默认不启用。Cua Driver 独立归档的双平台准入和负对照通过，桌面安装包不分发该提供方。[执行保护](requirements/2026-11-02-native-execution.md)
- 直接重读 `.16.4` 实包：Windows 919 包中 6 项、Linux 921 包中 8 项待核查，补充声明分别 21/26 份。这不代替许可兼容性审查。[审计](requirements/2026-11-03-dependency-notices.md)

## 回归范围

后续源码补齐可选 `target-protection/ssh-sessions`：确切 Agent 的独立连接、网安代理选择、关闭确认和资源连接捕获。YAML/Loader、普通 Node 构建入口及元数据快照已验证，Windows 并发各 67 项、Linux 190 项通过；首次 hygiene 的四项失败修复后已由原校验器复核，NodeNext 398 个 API 与 389 包 publint 通过。实包仍为 `.16.4`，尚不含这些源码。远端命令外连、身份/挂载映射等范围继续保留。[记录](requirements/2026-11-17-ssh-session-routing.md)

全仓文档仍有 30 处既有断链及两处预算超额，没有按定向通过报告为全仓通过。后续源码包含的清单和 slot catalog 整理不改变界面布局；索引更新行号及一条既有接口说明。[检查整理](requirements/2026-11-17-ssh-session-routing.md#检查整理)

受保护 SSH 后续源码增加关闭确认与规则修订保留：变更规则前等待远端 I/O、进程和清理确认；未知关闭结果保留规则并禁用新执行。Windows 两个独立进程各 52 项、Linux 175 项通过，实际 helper 文件 I/O 负对照按预期失败。新直连客户端需先升级 helper，旧客户端仍兼容新 helper；`.16.4` 尚未包含此源码修复。[记录](requirements/2026-11-17-ssh-shutdown.md)

后续源码修复了 OpenSSH 转发接受后、数据套接字创建前取消时漏清理的问题。修复前两项失败，修复后 43 项及两组并发各 43 项通过，入口文件四项覆盖率均为 100%。这是使用替身的协议/生命周期回归，没有连接真实服务器；尚未进入 `.16.4`，也不代表会话路由或远端映射完成。[记录](requirements/2026-11-16-ssh-cancellation.md)

完整 Web 基线 `web-baseline-7` 仍对应 `668ec5146d`，共 1,087 项通过、32 项条件跳过。本轮使用所属回归、完整构建和两平台实际产物复核，未重跑整轮。[基线](requirements/2026-11-16-regression-followup.md)

更新工作区运行器的十项单组和两组并发验收已经通过；编译测试遗漏版本导致的私有窗口报错已修复，缺少完整结果的零退出不再算成功。原有退出确认超时和一次 Host 就绪超时记录保留，不据重跑推断旧失败原因。签名已安装升级仍未完成。[稳定性](requirements/2026-11-06-stability.md#更新工作区运行器2026-11-16)

Host 的首次意外退出报告保留 PID、原始/十六进制状态、信号和关闭请求/确认状态。旧用户配置的 7:40 退出原因仍未知；新增取证不等于根因修复。Worker 预览的严格回放保留此前通过证据，本轮没有改写原始 Session。[退出事实](requirements/2026-11-06-stability.md#host-原生退出事实2026-11-16)

## 恢复与工作区

- 安装前备份：`D:/DSHU-Backups/20261116T115528Z-before-20261116-4-data`，7,342 个文件、0 个链接已核对，访问限当前用户、SYSTEM 和管理员。恢复前保留当前数据，不假设任意旧版均能写入新数据。
- 恢复安装器为 `.16.3`，前版回执在 `accepted-2026.11.16.3/`；更早的安装器、数据备份和回执仍保留。当前回执在交付目录根部，完整材料与图像在 `candidate-2026.11.16.4/`。
- `package-16-4-status.json` 记录作业句柄，当前构建、验包、安装与运行检查均已终止。应用交互进程预期保持运行，不据旧句柄重启测试。
- 新版界面 `78868`、Host `141336` 启动于北京时间 21:35。PID 只是观测，任何操作前必须重新核对路径、创建时间及父子关系。
- Windows 原 Worker 候选备份及 stash `a9921e56af9277a9e3917031a7052dc298ba8c29` 保留。原型已被最终实现替代，不用旧备份覆盖当前代码。
- Ubuntu 位于 `D:/WSL/Ubuntu`，私有检出为 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source`；SSH 后续验证的提交与工作树状态见交付目录中的 `ssh-cancel-checkpoint.json`。原候选备份和 stash `faee5b828ba8a877026376f96e41777df8fbe5ac` 保留。历史 WSL 备份不删除。

## 后续顺序与约束

继续 [TODO](TODO.md) 的 10 项。保留域名/主机规则、服务器/数据库执行、审计联动全部范围；按前两项真实执行后端到联动的顺序推进。SSH 的共享部署连接不能绑定首个会话的代理或归属；入站、部署、远端映射、其他协议、正式升级、回退和系统重启均待验收。

保持 main、中文提交及正常 Git hooks，不使用 Computer Use，不发布公开 Release、不签名、不重启系统。进阶保护和全部限额默认关闭；输入预测默认开启，余额默认 15 秒、最小 3 秒；关闭旁问清理默认关闭，`/clear` 仅用于旁问。

Windows 使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`；默认 14.51 缺 Spectre 库，不绕过预检。Linux 依赖保持锁定和供应链检查。新增浏览器测试已登记正确编译分组；首次失败产生的 48 个多余文件已保留副本并逐项核对摘要移出源码目录，详见更新检查记录。

## 清理与工作约束

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
