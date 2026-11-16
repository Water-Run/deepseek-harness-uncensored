# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 35 项完成、10 项进行中，另有 3 项未来计划。最近成功实查账号本周期剩余 3%，继续留意，确认达到 1% 时按用户规则收尾打包并暂停。Windows x64 优先，Linux x64 同步；macOS ARM、Android＋Fedora PRoot、全新安装器本轮不开发。

## 当前交付

| 项目 | 已核对状态 |
| --- | --- |
| 产品版本 | `2026.11.16.3`；内部版本 `2026.1116.3` |
| 构建源码 | `b2ca273d0f6cc43a343cb525a23fb93a7bbd097f`，两平台构建时工作树干净 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| Windows x64 | 已保留数据安装并通过隔离运行检查；新版已由 Explorer 启动供检查 |
| Linux x64 | deb/tar.gz、归档清单、CLI/API、隔离 X11/Wayland 启动和重载通过 |
| 发行状态 | 未签名检查包；正式签名、在线升级、许可审查与完整平台验收未完成 |

Windows 产物位于 `%USERPROFILE%/DSHU-Deliveries/20261116`，Linux 归档位于 `D:/DSHU-Deliveries/20261116`。文件名包含产品版本、内核、REA、平台和源码短提交。摘要、详细结果与限制见[本版交付记录](requirements/2026-11-16.3-delivery.md)。

## 本轮验收

- Host 意外退出首次触发故障时保留 PID、原始/十六进制状态、终止信号和关闭请求/确认状态。Windows/Linux 三文件各 70 项通过，1 项平台专属跳过；真实子进程覆盖 `0x40010004` 和 SIGTERM。旧用户配置的异常原因仍未知，没有声称根因已修复。[稳定性](requirements/2026-11-06-stability.md#host-原生退出事实2026-11-16)
- 新包的实际 REA/JavaScript、Office 文档往返和转换、长路径终端及离线插件安装/卸载通过。两平台 `.16.3` 中的 Frida 附加、插桩、卸载、重置、释放、暂停启动和退出各两项通过，只操作自建目标。[Frida](requirements/2026-11-06-stability.md#linux-frida-附加与回收2026-11-16)
- Windows 更新前后 7,338 份原有数据文件摘要一致，官方 DSH 两份关键文件不变。安装后四模式、旁问重开/清理、主旁删除、命令及关于页通过；Edge 158 的隔离 Web 检查覆盖指南和 1280/800px 星期布局，截图已查看。原测试浏览器缺失的失败保留，没有减少断言。
- Linux 两种归档的 ASAR 与可执行文件摘要相同；实际归档在私有 X11/Wayland 中通过主界面、默认工作区与重载。renderer 保留 seccomp、NoNewPrivs，没有 `--no-sandbox`。这不替代门户、实体桌面或正式更新验收。
- Inspector 保护入口已实际随包分发，在显式保护组合中拒绝任意 Host 调试；默认不选择该入口。Cua Driver 的保护入口仍未随本包分发。新增共享 JS chunk 的实际打包与解包导入已验证，完整 Worker 预览在严格只读回放下通过。[执行保护](requirements/2026-11-02-native-execution.md#inspector-调试准入2026-11-16源码)
- 依赖材料仍为 Windows 919 包中 6 项、Linux 921 包中 8 项待核查；不能将可运行或清点通过解释为许可兼容性结论。[审计](requirements/2026-11-03-dependency-notices.md)

本次按路径、摘要与进程身份核验后，只结束旧界面主进程，Host 依 IPC 断连清理并以 0 退出，随后确认安装目录下进程全部结束再备份。没有直接结束 Host，也没有进行系统重启；这不等于完整正常退出或关机验收。

## 回归范围

更新工作区运行器已补齐版本、欢迎页和依赖投影，拒绝只有退出码、没有完整场景报告的假成功。真实 Electron 单组十项通过，随后两个独立进程并发各十项通过，均正常退出；此前一次 Host 恢复等待超过 20 秒的失败仍保留，不能据重跑推断其原因。截图中的 `DSH_CLIENT_VERSION` 错误来自私有测试进程，不是已安装 `.16.3` 的构建缺失。此节点只修改测试与文档，安装包仍对应上表源码。[测试验收](requirements/2026-11-06-stability.md#更新工作区运行器2026-11-16)

完整 Web 基线 `web-baseline-7` 仍对应 `668ec5146d`：前置 10 项、主批次 1,077 项通过，32 项条件跳过。本轮使用定向回归、完整构建、实际组件和两平台产物检查，没有将旧整轮标成在新提交上重跑。[回归记录](requirements/2026-11-16-regression-followup.md)

`preview-after-multientry-16-3.log` 验证了共享 chunk 变化后的完整浏览器 Worker 部署，1 项通过；原始 Session 和当前期望均未改写。旧 PTC 输入、失败日志和修正后的只读基线继续保留。

## 恢复与工作区

- 当前安装前备份：`D:/DSHU-Backups/20261116T053423Z-before-20261116-3-data`，7,338 文件已核对，权限仅当前用户、SYSTEM 和管理员。恢复前核对其中清单，不假设任意旧版均可写入新数据。
- 前一版恢复安装器：`DSHU-2026.11.16.2-core-0.2.2-rc.3-REA-6.9.0-win-x64-668ec51.exe`，SHA-256 `329fcf84bc14dae179fb17cec1e3a83ef4cad3ba21d4ee8a02b9820b58ab973b`。`.16.2` 回执已保存在 `accepted-2026.11.16.2/`；更早的安装器、数据备份和 `accepted-2026.11.16.1/` 均保留。
- 当前回执在交付目录根部；完整材料和截图在 `candidate-2026.11.16.3/`。`package-16-3-status.json` 记录各作业句柄；本轮构建、验包、安装、图形及运行检查均已终止，不据旧状态重启。
- 新版实际进程曾观测到界面 `89380`、Host `127096`，启动于北京时间 14:03，短时无新崩溃。PID 只是观测，操作前必须重新核对路径、创建时间和所属关系；不得按旧 PID 结束进程。
- Windows 原 Worker 候选备份在 `20261116/worker-preview-before-20261116-1.{zip,json,patch}`，stash `a9921e56af9277a9e3917031a7052dc298ba8c29` 保留。候选已经合入，不以旧备份覆盖现有实现。
- Ubuntu 位于 `D:/WSL/Ubuntu`，私有检出 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source` 当前为 `b2ca273d0f`。更新前 11 份候选的 tar、patch、摘要及 stash `faee5b828ba8a877026376f96e41777df8fbe5ac` 保留；历史 WSL 与更早候选备份不删除。

## 后续顺序与约束

继续 [TODO](TODO.md) 的 10 项，保留域名/主机规则、服务器/数据库执行、审计联动全部范围。SSH 是部署级共享连接，不能绑定首个会话的代理或归属；按会话路由仍需明确连接所有权。进阶保护的入站、部署、远端映射与协议、正式发行、自动回退、重启和平台验收均未完成。

保持 main、中文提交与正常 Git hooks，不使用 Computer Use，不发布公开 Release、不签名或重启系统。进阶保护和全部限额默认关闭；输入预测默认开启，余额默认 15 秒且最小 3 秒，旁问关闭清理默认关闭，`/clear` 仅用于旁问。

Windows 打包选择已验证的 `VCToolsVersion=14.52.36629`、`MSVCPreviewEnabled=true`；默认 14.51 缺 Spectre 库，不能绕过预检。Linux 安装锁定依赖需要完整的供应链元数据；本轮离线准备因缺 simple-icons 元数据失败，联网补齐后通过，原失败保留。


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
