# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 34 项完成、11 项进行中，见 [TODO](TODO.md)。实际剩余额度达到 1% 时按用户规则收尾暂停。macOS、Android＋Fedora PRoot、全新安装器仍只规划。

## 当前交付

| 项目 | 当前状态 |
| --- | --- |
| 产品版本 | `2026.11.15.3`，内部版本 `2026.1115.3` |
| Windows x64 | 已保留数据安装；关于、CLI、文件资源、卸载登记和主载荷版本一致 |
| Linux x64 | deb/tar.gz、CLI/API、隔离 X11/Wayland 欢迎页与渲染沙箱通过 |
| 构建源码 | `80686a962218bdc3706f18f5e27ff5a7bde37c50`；后续交付文档提交不改变程序字节 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| 发行状态 | 未签名检查包；正式签名、在线升级、完整许可和平台验收未完成 |

Windows 安装包及回执位于 `%USERPROFILE%/DSHU-Deliveries/20261115`，Linux 归档位于 `D:/DSHU-Deliveries/20261115`。文件名包含版本、内核、REA、平台和源码短提交。日期按 Asia/Shanghai 编号，见[打包指南](../apps/desktop/packaging/README.zh.md)。

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `d11f65b1854b56c952572f50539058976a2259b4dd20263ded74f273d8842ceb` |
| Linux x64 tar.gz | `66f96d09a87a8be4257714680e6e53dc9ca9a6b2e0e4c7a65f671171e62a9364` |
| Linux x64 deb | `1605b4606402983b694e9a4769a892184e83cf9364b649cc0f4c0f129b504e38` |

## 本版修复与验证

- 模式和主题过渡取消不再产生未处理拒绝，运行状态更新不重复启动同一模式的扩散动画。
- 旧 PTC/极简会话恢复本地化标题，可选 Creator 创建会话后关闭 Settings 并聚焦输入框；默认保持四模式。
- 插件设置的可选语言文案已统一，模式资料的未选工作区提示已去重。
- 相关模块 812 项回归、20 项动效用例通过；11 项模式流程与 15 项生命周期浏览器场景只读通过。取消处理的负对照按预期失败，源码已恢复并复验。
- 两平台实包通过四模式、新会话、命令执行、旁问重开/清理及主旁会话删除；未调用付费模型。REA JavaScript、Office 转换/渲染/重算和 CLI 离线插件安装卸载通过。
- Windows 更新前后 7,318 个用户文件及官方 DSH 两份程序文件摘要一致；CLI、关于页、PE 和卸载登记均为 `2026.11.15.3`。系统应用在验证后保持关闭。
- Linux 原生欢迎页可见，renderer 保留 seccomp 与 NoNewPrivs；这是隔离图形环境验证。Wayland 的后台加载窗口截图超时，最终欢迎窗口截图成功并已检查。

源码与浏览器记录见[模式流程](requirements/2026-11-15-mode-flow.md)、[设置回归](requirements/2026-11-15-settings-regression.md)和[核心流程](requirements/2026-11-15-core-flow.md)。版本传递、实装与环境记录见[本次交付](requirements/2026-11-15-delivery.md)。

原生 Cua Driver 保护入口已在源码实现准入、撤销、审计和关闭等待，30 项回归及编译入口检查通过；实际确认默认检查包不包含该实验包，不能把源码验证当成产品集成完成。[执行层记录](requirements/2026-11-02-native-execution.md)

## 继续验收

新完整 Web 基线为 889 项通过、182 项失败、37 项跳过及 1 项异步错误；随后四批 167 个场景只读复验覆盖其中 75 项失败所属场景，整套尚未再次运行。代码块纯文本/差异聚焦已修复；长命令、历史恢复与嵌入式插件窗口通过本批 40 个 Web 场景，Markdown 相关 152 项通过。Windows 桌面完整单元回归为 2,075 项通过、64 项按条件跳过，无失败；实际平台/发行验收仍另列。输入目录改为挂载后明确激活，消除了构造期间的跨组件更新告警；团队、图片、检查器和命令菜单等本批 42 项 Web 流程通过，相关单测 350 项通过，另有 1 项预期失败自检。快捷键、导航、8 种语言窄屏和首次配置新增 33 项只读验收通过。最近的代码修复尚未进入安装包。[当前回归记录](requirements/2026-11-15-regression-baseline.md)

Linux 原生门户、Debian/Fedora 与实体桌面、自动回退、系统重启、正式签名/下载升级，以及外部引擎与可选目标保护的剩余场景仍在 TODO。许可清单为 Windows 919 包中 7 项、Linux 921 包中 9 项待审。

## 恢复入口

- 上一版 `2026.11.15.2` 程序：`D:/DSHU-Backups/20261114T221752Z-20261115-2-installed-program`，16,417 文件已校验。
- 本次安装前的数据：`D:/DSHU-Backups/20261114T223028Z-before-20261115-3-data`，7,318 文件已校验，仅当前用户、SYSTEM 和管理员可访问。自动回退仍未验收。
- 当前证据：`current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`、`linux-*-startup.json` 和 `delivery-index.json`。
- `.2` 的原交付回执保存于同日目录的 `accepted-2026.11.15.2`。更早的有效安装包、程序/数据备份及 `.1` 版本一致性失败记录继续保留。

## 清理与工作约束

此前已删除约 2.92 GiB 的 Linux 旧解包逻辑数据；未把它当作 Windows 宿主即时释放量。历史上约 5.78 GiB、两个构建目录及 C 盘约 1.9 GiB 旧解包目录的删除被自动审批以 `blocked by policy` 拒绝，仍保留，没有换方式重试。本轮已核验 `.2` 的旧 Windows 解包目录 `D:/DSHU-Delivery-Work/20261115/installer-check-CtUwda`：16,422 个文件、2,035,029,157 字节、无链接或进程引用，原安装包摘要一致。其删除同样被自动审批以 `blocked by policy` 拒绝；约 1.90 GiB 仍保留，未换方式重试，回执为 `old-windows-2-extraction-cleanup-rejected.json`。当前产物、备份和验收目录继续保留。

继续时读取 TODO 并核对实际工作树与安装版本。保持 main、中文提交、正常 Git hooks，不使用 Computer Use。进阶目标保护和所有限额默认关闭；保护按域名/主机规则、服务器/数据库、审计联动顺序推进。
