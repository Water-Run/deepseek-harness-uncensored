# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 35 项完成、10 项进行中，另有 3 项未来计划。最近成功实查剩余 98%；确认达到 1% 时按用户规则收尾并暂停。Windows x64 优先、Linux x64 同步；macOS ARM、Android＋Fedora PRoot及全新安装器本轮不开发。

## 当前交付

| 项目 | 已核对状态 |
| --- | --- |
| 产品版本 | `2026.11.17.1`；内部版本 `2026.1117.1` |
| 构建源码 | `96a126b878b79a132dd3726d8647a49b4081fecd`，两平台构建时工作树干净 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，发布标签对应 `d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| Windows x64 | 保留数据更新，7,346 文件及官方 DSH 两份关键文件摘要一致；API、CLI、模式、旁问、删除、限流、About 和 Frida 复验通过；已正常用户环境启动 |
| Linux x64 | deb/tar.gz、归档、API、私有 X11/Wayland 主界面及重载通过；实包 Frida 两项通过 |
| 发行状态 | 未签名检查包；正式签名、在线升级、许可和完整平台验收未完成 |

Windows 产物位于 `%USERPROFILE%/DSHU-Deliveries/20261117`，Linux 文件位于 `D:/DSHU-Deliveries/20261117`。版本、摘要、验证和限制见[本版交付](requirements/2026-11-17.1-delivery.md)。上游已发布 DSH/REA 及 npm 版本已重新核对，未纳入 REA 未发布主分支。

## 本版验收与范围

- SSH 转发取消、远端关闭确认及可选会话连接/独立代理已进入包。Windows 两组并发各 67 项、Linux 190 项源码回归，15 项新增场景、177 项清单回归通过；包内入口可被实际 Electron Node 导入，默认容量 16。[取消](requirements/2026-11-16-ssh-cancellation.md) · [关闭](requirements/2026-11-17-ssh-shutdown.md) · [会话路由](requirements/2026-11-17-ssh-session-routing.md)
- 8 项产物构建、2 项聚合编译、推送前 5 项类型检查、398 个 NodeNext API、389 包 publint、JSDoc 和五组双语配对通过。首次 hygiene 的四项失败由原校验器修复复核，不声称首次汇总通过。
- 实装的四模式、旁问清理/重开、主旁删除、受控命令、关于页、模式指南、1280/800px 星期布局及注入 429 通过。Edge 158 的普通和限流探测验证弹窗前台与焦点，不承诺 DOM 身份。关于页截图已检查。
- Linux 两种归档的 ASAR/执行文件摘要一致，私有 X11/Wayland 默认工作区和重载通过；renderer 保留 seccomp、NoNewPrivs，没有使用 `--no-sandbox`。实体桌面和门户仍待验收。
- 两平台 `.17.1` Frida 各两项，只操作自建 C 目标；任意已有进程、商业引擎和其他远程设备仍未完成。REA、Office、终端及离线插件构建检查通过。
- Windows 919 包中 6 项、Linux 921 包中 8 项仍待许可核查，补充文本分别 21/26 份，不以运行通过代替许可结论。[审计](requirements/2026-11-03-dependency-notices.md)

完整 Web 基线仍为 `668ec5146d` 的 1,087 项通过、32 项条件跳过，本版没有重跑整轮。[基线](requirements/2026-11-16-regression-followup.md)

全仓文档已修复 28 处断链和两处篇幅超额；剩余两处冻结指南链接已准备 URL 修复补丁，待用户确认例外。没有放宽校验器或修改冻结文件。[记录](requirements/2026-11-17-documentation-repair.md)slot catalog 从已有声明重生成，只更新行号及一条说明。旧 7:40 Host 退出和历史 403 的原因仍未知；新增取证与重跑不等于根因修复。[稳定性](requirements/2026-11-06-stability.md) · [更新检查](requirements/2026-11-16-release-check.md)

## 恢复与工作区

- 本次备份：`D:/DSHU-Backups/20261116T190448Z-before-20261117-1-data`，7,346 文件、0 链接，限当前用户/SYSTEM/管理员。恢复前另存当前数据，不推断任意旧版都能写入新数据。
- 恢复安装器为 `.16.4`，SHA-256 `7003cbba8a3cc8a90d168e0d70a16185b1d37ee17dddb6eff5e9b055ae0f1a42`；回执在 `20261117/accepted-2026.11.16.4/`。完整新材料在 `20261117/candidate-2026.11.17.1/`，原有备份/安装器保留。
- 当前构建、验包、安装及私有运行检查均已终止；正常用户应用预期继续运行。观测界面 PID `136464`、Host `98000`，北京时间 03:24 启动；后续动作前重新核对路径、创建时间和父子关系。未新增崩溃报告，未认证 HTTP 返回预期 401；不能仅凭进程存在认定所有用户数据功能均已验收。
- 旧界面经核实后结束，Host IPC 清理退出 0，未直接结束 Host；这不等于完整正常退出或系统重启验收。官方 DSH 原进程和两份关键文件未变化。
- Windows 原 Worker 候选备份和 stash `a9921e56af9277a9e3917031a7052dc298ba8c29` 保留，不用旧原型覆盖当前实现。Ubuntu 在 `D:/WSL/Ubuntu`，私有检出 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source` 的构建提交为 `96a126b878`；原 stash `faee5b828ba8a877026376f96e41777df8fbe5ac` 和 WSL 备份保留。

## 后续顺序与约束

继续 [TODO](TODO.md) 的 10 项。保留域名/主机规则、服务器/数据库、审计联动完整范围，按真实执行后端到联动推进。SSH 的 Agent 连接路由已交付，但不代表远端命令外连、身份/挂载映射、入站、其他协议、部署和完整保护已完成。正式签名升级、回退、系统重启及实体平台验收仍保留。

保持 main、中文提交和正常 Git hooks，不使用 Computer Use，不发布公开 Release、不签名、不重启系统。进阶保护和全部限额默认关闭；输入预测默认开启，余额默认 15 秒/最小 3 秒；关闭旁问自动清理默认关闭，`/clear` 仅用于旁问。

Windows 使用 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`，不绕过 Spectre 预检。Linux 保持锁文件和供应链校验。本轮 Windows ASAR 新检查曾因路径分隔符误报缺包，已修正验证器并复核；备用默认 Chromium 缺失，既有 Edge 正式脚本通过，失败日志保留。

## 清理与工作约束

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
