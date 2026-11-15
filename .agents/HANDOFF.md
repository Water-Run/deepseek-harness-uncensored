# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 34 项完成、11 项进行中，见 [TODO](TODO.md)。实际剩余额度达到 1% 时按用户规则收尾暂停。macOS、Android＋Fedora PRoot、全新安装器仍只规划。

## 当前交付

| 项目 | 当前状态 |
| --- | --- |
| 产品版本 | `2026.11.15.4`，内部版本 `2026.1115.4` |
| Windows x64 | 已保留数据安装；关于、CLI、文件资源、卸载登记和主载荷版本一致 |
| Linux x64 | deb/tar.gz、CLI/API、隔离 X11/Wayland 欢迎页与渲染沙箱通过 |
| 构建源码 | `74d53757b50b12c5c9cbc214c08d76b34254691d`；后续交付文档不改变程序字节 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| 发行状态 | 未签名检查包；正式签名、在线升级、完整许可和平台验收未完成 |

Windows 安装包及回执位于 `%USERPROFILE%/DSHU-Deliveries/20261115`，Linux 归档位于 `D:/DSHU-Deliveries/20261115`。文件名含版本、内核、REA、平台和源码短提交；日期按 Asia/Shanghai 编号，见[打包指南](../apps/desktop/packaging/README.zh.md)。

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `91f2e8b18e0c1cf63dbb755229401c7a39f3c6e0eab98ede1a34425de92f511d` |
| Linux x64 tar.gz | `8fd6336b80daffe068e1a519e7a422e8767c09950e635b0069048b38000ddcd9` |
| Linux x64 deb | `a31ff9af5cb2ffe6aec235b35c5ca6e55041f693a51b12b1d8a3f6773205c4a5` |

## 本版修复与验证

- 包含模式/主题过渡、旧模式名称和可选插件入口修复，代码块纯文本/差异正文可键盘聚焦。
- 命令与技能目录在输入视图挂载后明确激活；重复挂载不重复预热，消除了构造期间的跨组件更新告警。
- Web 分批回放累计 167 项通过，覆盖新基线中 75 个失败所属场景；完整 Web 尚未重跑。最近一次完整 Windows 桌面单元测试为 2,075 项通过、64 项条件跳过；相关输入/目录/运行时单测 350 项通过，另有 1 项预期失败自检。[回归记录](requirements/2026-11-15-regression-baseline.md)
- 两平台实际归档通过四模式、新会话、命令、旁问重开/清理和主旁删除；REA JavaScript、Office 文档往返与 CLI 离线插件安装卸载通过，未调用付费模型。
- Windows 安装前后 7,318 个用户文件及官方 DSH 两份程序文件摘要一致；已查看安装版关于页。
- Linux 两种归档的 可执行文件/ASAR 摘要一致；私有 X11/Wayland 欢迎页可见，renderer 保留 seccomp 与 NoNewPrivs。Wayland 隐藏加载窗口截图超时，最终欢迎页截图通过并已检查。

首轮打包遇 C 盘空间不足及 WSL 只读故障；另一次 Windows 检查遇原生退出延迟。失败均保留，试验性改法已撤回，没有增大超时或跳过检查。环境恢复后使用标准临时目录、降低并发并串行打包，最终监督记录所有阶段通过。[交付记录](requirements/2026-11-15-delivery.md)

## 继续验收

安装版仍为 `2026.11.15.4`。后续源码已修正插件市场索引按钮和卡片越出设置面板的问题，补通插件安装/取消/结果恢复与浅深主题布局的 10 项只读回归；尚未重新打包。Web 五批累计 177 项通过，覆盖基线 84 个原失败所属场景，完整套件仍待复验。[记录](requirements/2026-11-15-regression-baseline.md#插件安装与市场布局)

原生 Cua Driver 保护入口的源码准入、撤销、审计和关闭等待已验证；本次完整运行时清单仍不包含该实验包，不能把源码通过当作产品集成完成。[执行层](requirements/2026-11-02-native-execution.md)

继续处理剩余 Web 失败、原生门户、实体 Linux 桌面、自动回退/重启、正式更新与外部引擎、可选目标保护联动。许可证清单为 Windows 919 包中 7 项、Linux 921 包中 9 项待审。

## 恢复入口

- 上一版 `.3` 程序：`D:/DSHU-Backups/20261115T015401Z-20261115-3-installed-program`，16,417 文件已校验。
- 本次安装前数据：`D:/DSHU-Backups/20261115T040053Z-before-20261115-4-data`，7,318 文件已校验，限当前用户、SYSTEM 和管理员访问。自动回退仍未验收。
- 当前证据：`current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`、`linux-*-startup.json` 和 `delivery-index.json`。
- `.3` 回执保留在 `accepted-2026.11.15.3`；更早安装包、备份、验收及 `.1` 版本一致性失败记录继续保留。

## 清理与工作约束

此前已删除约 2.92 GiB 的 Linux 旧解包逻辑数据；未把它当作 Windows 宿主即时释放量。历史上约 5.78 GiB、两个构建目录及 C 盘约 1.9 GiB 旧解包目录的删除被自动审批以 `blocked by policy` 拒绝，仍保留，没有换方式重试。本轮已核验 `.2` 的旧 Windows 解包目录 `D:/DSHU-Delivery-Work/20261115/installer-check-CtUwda`：16,422 个文件、2,035,029,157 字节、无链接或进程引用，原安装包摘要一致。其删除同样被自动审批以 `blocked by policy` 拒绝；约 1.90 GiB 仍保留，未换方式重试，回执为 `old-windows-2-extraction-cleanup-rejected.json`。本版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T03-41-25.591Z-vBjugI/win-unpacked` 也已核验：16,411 文件、1,590,687,931 字节、无链接和进程引用，安装器与已安装版本均已验证。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，未换方式重试；回执为 `windows-unpacked-4-cleanup-rejected.json`。安装包、备份和回执继续保留。

继续时读取 TODO 并核对实际工作树与安装版本。保持 main、中文提交、正常 Git hooks，不使用 Computer Use。进阶目标保护和所有限额默认关闭；保护按域名/主机规则、服务器/数据库、审计联动顺序推进。
