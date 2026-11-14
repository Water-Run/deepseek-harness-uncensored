# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 34 项完成、11 项进行中，见 [TODO](TODO.md)。实际剩余额度达到 1% 时按用户规则收尾暂停。macOS、Android＋Fedora PRoot、全新安装器仍只规划。

## 当前交付

| 项目 | 当前状态 |
| --- | --- |
| 产品版本 | `2026.11.15.2`，内部版本 `2026.1115.2` |
| Windows x64 | 已保留数据安装；关于、CLI、文件资源、卸载登记和主载荷版本一致 |
| Linux x64 | deb/tar.gz 归档、CLI/API、隔离 X11/Wayland 欢迎页和渲染沙箱通过 |
| 构建源码 | `5882a52921c7e33b24242b0c2fba240647e66884`；后续交付文档提交不改变程序字节 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| 发行状态 | 未签名检查包；签名、正式在线升级、完整许可及平台验收继续进行 |

Windows 安装包和两平台回执位于 `%USERPROFILE%/DSHU-Deliveries/20261115`；Linux 归档位于 `D:/DSHU-Deliveries/20261115`。文件名包含公开版本、内核、REA、平台及源码短提交。构建日期使用 Asia/Shanghai，规则见[打包指南](../apps/desktop/packaging/README.zh.md)。

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `d289685c91ef6b362a5582f6f835c7c793a5c6307c5f920db3b7ec0d4519d097` |
| Linux x64 tar.gz | `a7e592ea1c2a87923349afb18bcd997037c1240a13b9e533dcf5171b6be95cfa` |
| Linux x64 deb | `88e8d160d102a7dd2ad8df3e02c75a333d541ef06307c56a148dd142342af109` |

## 本轮验证

- 修复 CLI、桌面运行时描述与主载荷未跟随构建编号的问题；构建和实装均实际运行 CLI 检查。`2026.11.15.1` 未通过该检查，记录保留于 `attempt1`，请使用修正版。
- 两平台实际产物通过四模式、新会话、命令执行、旁问重开/清理及主旁会话删除；无付费模型调用。REA JavaScript、Office 转换/渲染/重算及 CLI 离线插件安装卸载通过。
- Windows 两次更新均核对 7,318 个用户文件和官方 DSH 的两份程序文件；修正版的实际关于页、CLI、PE 和登记版本为 `2026.11.15.2`。
- 原生欢迎页统一中英文 Slogan，41 项对应测试通过；X11/Wayland 实际欢迎页可见，截图内容一致，渲染器保留 seccomp 与 NoNewPrivs。没有使用 Computer Use。
- 运行时版本相关 38 项测试通过，包括拒绝旧基线运行时；完整 GUI 14,023 项通过、2 项跳过。两平台打包流水线完整构建各 10 项通过，3,683 份历史输入和冻结归档摘要保持。

新增下拉和设置回归见[设置记录](requirements/2026-11-15-settings-regression.md)，31 项核心交互只读回放见[核心流程记录](requirements/2026-11-15-core-flow.md)，打包、版本修复和环境细节见[本次交付](requirements/2026-11-15-delivery.md)。

## 安装后源码进展

原生 Cua Driver 可选保护入口已实现：初始化与直接工具调用均校验，策略变更撤销并等待原生关闭，关闭失败保留保护资源。30 项测试及编译公开入口的四类拒绝通过；未执行真实桌面操作。此改动尚未包含在 `2026.11.15.2`，完整范围和限制见[执行层记录](requirements/2026-11-02-native-execution.md)。

## 继续验收

上次完整 Web 基线为 778 项通过、270 项失败、44 项跳过及 10 项异步错误；其后设置/工作区 45 项、可选插件 13 项、核心交互 31 项分批通过，整套尚未重新运行。完整 Desktop 原基线为 2,003 项通过、28 项失败、65 项跳过；已分组修复的结果不能代表整套通过。

Linux 仍需原生门户、Debian/Fedora 与实体桌面验收。自动回退、系统重启、正式签名/下载升级，以及外部引擎和可选目标保护的剩余场景保留在 TODO。许可清单仍为 Windows 919 包中 7 项、Linux 921 包中 9 项待审。

## 恢复入口

- 最近通过版本核对的旧程序 `2026.11.14.1`：`D:/DSHU-Backups/20261114T180858Z-20261114-1-installed-program`，16,417 文件已校验；自动回退未验收。
- 修正版安装前的数据：`D:/DSHU-Backups/20261114T193059Z-before-20261115-2-data`，7,318 文件已校验。备份仅允许当前用户、SYSTEM 和管理员访问。
- 当前证据：`current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`、`linux-*-startup.json`。此前 20261113/20261114 的有效安装包和备份继续保留。

首次常规退出返回 Restart Manager 351，按已有重启授权结束了已核对路径的 DSHU 进程，然后备份停止后的磁盘数据。没有进行系统重启，也没有卸载官方 DSH。

## 清理与工作约束

已清除本轮 Linux 旧解包副本的 33,895 个文件、约 2.92 GiB 逻辑数据，两种原始归档及回执保留；不能将逻辑数据量当作 Windows 宿主即时释放量。先前约 5.78 GiB、两个构建目录以及本轮 C 盘约 1.9 GiB 旧解包目录被自动审批以 `blocked by policy` 拒绝删除，仍保留，没有换方式重试。

继续时读取 TODO 并核对实际代码和安装版本。保持 main、中文提交、正常 Git hooks、不使用 Computer Use。进阶真实目标保护和所有限额默认关闭；保护验收按域名/主机规则、服务器/数据库、审计联动顺序推进。
