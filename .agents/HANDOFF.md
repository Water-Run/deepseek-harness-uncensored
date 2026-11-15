# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 34 项完成、11 项进行中，见 [TODO](TODO.md)。实际剩余额度达到 1% 时按用户规则收尾暂停。macOS、Android＋Fedora PRoot、全新安装器仍只规划。

## 当前交付

| 项目 | 当前状态 |
| --- | --- |
| 产品版本 | `2026.11.15.5`，内部版本 `2026.1115.5` |
| Windows x64 | 已保留数据安装；关于、CLI、文件资源、卸载登记和主载荷版本一致 |
| Linux x64 | deb/tar.gz、CLI/API、隔离 X11/Wayland 欢迎页与渲染沙箱通过 |
| 构建源码 | `922ccfe9b6caa0b8160b141ae203f620f2b34d7c`；后续交付文档不改变程序字节 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| 发行状态 | 未签名检查包；正式签名、在线升级、完整许可和平台验收未完成 |

Windows 安装包及回执位于 `%USERPROFILE%/DSHU-Deliveries/20261115`，Linux 归档位于 `D:/DSHU-Deliveries/20261115`。文件名含版本、内核、REA、平台和源码短提交；日期按 Asia/Shanghai 编号，见[打包指南](../apps/desktop/packaging/README.zh.md)。

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `0f25c8f91bd52304700b712405313f313a07b4479cbfa758a2100585ad3d35ce` |
| Linux x64 tar.gz | `bc7891cfc8d9c79e8bae82aeb1b46008ec93c49ddab47f0c0280240eaa69f88c` |
| Linux x64 deb | `5c3d7ee66f87d8d645e9a54fe4a59c05252fbbc5af3ca070955b1b6c52f2440f` |

## 本版修复与验证

- 新增插件市场窄屏边界、充值返回后余额刷新和赠金通知跳转额度页修复。
- Web 七批累计 251 个场景取得通过记录，覆盖原基线中 106 个失败所属场景；完整 Web 尚未重跑。账号与余额相关单测 94 项通过，刷新监听的负对照按预期失败。[回归记录](requirements/2026-11-15-regression-baseline.md)
- 两平台实际归档通过四模式、新会话、命令、旁问重开/清理和主旁删除；REA JavaScript、Office 文档往返与 CLI 离线插件安装卸载通过，未调用付费模型。
- Windows 安装前后 7,318 个用户文件及官方 DSH 两份关键程序文件摘要一致；已查看安装版关于页。
- Linux 两种归档的可执行文件/ASAR 摘要一致；私有 X11/Wayland 欢迎页可见，renderer 保留 seccomp 与 NoNewPrivs。两环境各有一条资源 404；Wayland 隐藏加载窗口的诊断截图超时，可见欢迎页截图成功并已核对。

本次 Windows 与 Linux 监督打包均成功，使用原有检查和超时。较早版本的失败与恢复过程继续保留在[交付记录](requirements/2026-11-15-delivery.md)。

## 继续验收

OpenAI 编辑入口出现过一次超时，随后单项及提供商整组通过；根因未确认，保留诊断继续跟踪。继续处理剩余 Web 失败、Linux 资源 404、原生门户、实体桌面、自动回退/重启、正式更新与外部引擎、可选目标保护联动。许可证仍为 Windows 919 包中 7 项、Linux 921 包中 9 项待审。

原生 Cua Driver 保护入口的源码准入、撤销、审计和关闭等待已验证；当前运行时清单不包含该实验包，不能把源码通过当作产品集成完成。[执行层](requirements/2026-11-02-native-execution.md)

## 恢复入口

- 上一版 `.4` 程序：`D:/DSHU-Backups/20261115T061538Z-20261115-4-installed-program`，16,417 文件已校验。
- 安装前数据：`D:/DSHU-Backups/20261115T063309Z-before-20261115-5-data`，7,318 文件已校验，限当前用户、SYSTEM 和管理员访问。自动回退仍未验收。
- 当前证据：`current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`、`linux-*-startup.json` 和 `delivery-index.json`。
- `.4` 回执保留在 `accepted-2026.11.15.4`；更早安装包、备份和失败记录继续保留。

## 清理与工作约束

第 5 版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T06-15-31.325Z-BsBDM7/win-unpacked` 已核验：16,411 文件、1,590,687,914 字节，无链接、无进程引用；恢复安装器和实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，没有重试；回执为 `windows-unpacked-5-cleanup-rejected.json`。此前被拒绝的路径同样保留，不换方式重试。


此前已删除约 2.92 GiB 的 Linux 旧解包逻辑数据；未把它当作 Windows 宿主即时释放量。历史上约 5.78 GiB、两个构建目录及 C 盘约 1.9 GiB 旧解包目录的删除被自动审批以 `blocked by policy` 拒绝，仍保留，没有换方式重试。此前已核验 `.2` 的旧 Windows 解包目录 `D:/DSHU-Delivery-Work/20261115/installer-check-CtUwda`：16,422 个文件、2,035,029,157 字节、无链接或进程引用，原安装包摘要一致。其删除同样被自动审批以 `blocked by policy` 拒绝；约 1.90 GiB 仍保留，未换方式重试，回执为 `old-windows-2-extraction-cleanup-rejected.json`。第 4 版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T03-41-25.591Z-vBjugI/win-unpacked` 也已核验：16,411 文件、1,590,687,931 字节、无链接和进程引用，安装器与已安装版本均已验证。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，未换方式重试；回执为 `windows-unpacked-4-cleanup-rejected.json`。安装包、备份和回执继续保留。

继续时读取 TODO 并核对实际工作树与安装版本。保持 main、中文提交、正常 Git hooks，不使用 Computer Use。进阶目标保护和所有限额默认关闭；保护按域名/主机规则、服务器/数据库、审计联动顺序推进。
