# DSHU 开发交接

**Goal「实现DSHU」保持活动。** 当前 34 项完成、11 项进行中，见 [TODO](TODO.md)。实际剩余额度达到 1% 时按用户规则收尾暂停。macOS、Android＋Fedora PRoot、全新安装器仍只规划。

## 当前交付

| 项目 | 当前状态 |
| --- | --- |
| 产品版本 | `2026.11.15.8`，内部版本 `2026.1115.8` |
| Windows x64 | 已保留数据安装；关于、CLI、文件资源、卸载登记和主载荷版本一致 |
| Linux x64 | deb/tar.gz、CLI/API、隔离 X11/Wayland 主界面、重载与渲染沙箱通过 |
| 构建源码 | `6df17fffab73192f3b1c145548e6144725b630a5`；后续源码改动不改变这份安装包 |
| DSH 内核 | `0.2.2-rc.3`，`38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| REA | `6.9.0`，`d74549e495c58eb4a560279fd9f05508401ea0a0`，255 项目录 |
| 发行状态 | 未签名检查包；正式签名、在线升级、完整许可和平台验收未完成 |

Windows 安装包及回执位于 `%USERPROFILE%/DSHU-Deliveries/20261115`，Linux 归档位于 `D:/DSHU-Deliveries/20261115`。文件名包含版本、内核、REA、平台和源码短提交；日期按 Asia/Shanghai 编号，见[打包指南](../apps/desktop/packaging/README.zh.md)。

| 产物 | SHA-256 |
| --- | --- |
| Windows x64 EXE | `3ab3505a4e7f573639f890e4c8679b218dc38f9d410107c0437b345ccfe29190` |
| Linux x64 tar.gz | `c4fe2751d770bd38c9e6c42286648b52096715b956bc1d8cc52af5be92a9f393` |
| Linux x64 deb | `537dc09e415b656d045333428fb7aad634e16f55394bd7580de95a34ad052e56` |

## 本版修复与验证

- 修复启动时过早读取可选目标设置导致的 404，以及侧栏菜单按钮缺失样式造成的尺寸与对齐问题。
- 九批 Web 累计 301 个场景取得通过记录。拖拽排序不变已定位为测试在行入场动画中采样坐标，实际拖回自身；等待真实动画后，18 项原文件只读回归通过。较早 180 秒超时是否同源仍待核实。[回归记录](requirements/2026-11-15-regression-baseline.md)
- 两平台实际归档通过四模式、新会话、命令、旁问重开/清理和主旁删除；REA JavaScript、Office 文档往返与 CLI 离线插件安装卸载通过，未调用付费模型。
- Windows 安装前后 7,318 个用户文件及官方 DSH 两份关键文件摘要一致，安装版关于页已查看。
- Linux deb/tar.gz 的可执行文件与 ASAR 摘要一致。私有 X11/Wayland 中实际归档的主界面和重载均通过，renderer 保留 seccomp 与 NoNewPrivs，默认工作区目录已验证。X11 启动的 GitHub 更新接口两次返回 403，已记录；Wayland 无控制台或 HTTP 失败，不把这些启动检查当作正式更新验收。
- 内置 Frida 的 Windows 附加/恢复和 Linux 启动目标验收已落盘；范围与未验项目见[稳定性记录](requirements/2026-11-06-stability.md#frida-本地目标验收2026-11-15)。

## 已交付模式文档

用户追加要求恢复对应模式配色并丰富说明。源码已补全四种模式的中英文能力、工具、上下文与使用示例，采用各自颜色的页头和章节强调；深色标题对比度至少 4.5:1。77 项单元测试和 Windows/Linux 各 8 组浏览器布局用例通过，已查看实际截图。此项已包含在 `.7`，安装版四模式的配色、说明、三组示例及焦点恢复均已复验。[记录](requirements/2026-11-15-mode-guides.md)

## 本轮回归补齐

原生语言与日语元数据夹具显式加载可选语言包，保留产品默认只提供中英文；验证系统自动选择、显式偏好、重载和窄屏。工作区隔离开关通过 Settings 的真实入口验收；SSH 空应用目录隐藏、正式渠道保存也通过。6 文件共 27 项 Linux 只读回归通过；Windows 的原生语言与设置两项定向复验通过。日期版本预期来自经过产物摘要校验的构建记录，避免把发行构建版本误当作仓库基础版本。[回归记录](requirements/2026-11-15-regression-baseline.md)

## 本版新增修复

已修复退出动画期间弹窗重开的前台顺序、默认凭据遮罩的比例字体位移，以及旧凭据值恢复后的显示状态复用。30 项 Web 只读场景和 76 项相关单测通过，含改前失败的可控回归；实际页面截图已检查。输入、消息操作、引用和快捷键夹具已对齐当前产品行为，默认设置及 Session JSONL 未改。已随 `.8` 交付，安装版验证重开的弹窗同时位于视觉和焦点前台，保留同一 DOM 节点。[记录](requirements/2026-11-15-regression-baseline.md#弹窗重开凭据遮罩与输入回归)

8 个 Markdown/公式/链接文件的 13 项只读回归通过，核对了过期预期与当前输入；原始 Session JSONL 保持不变。记录见 `cohort-o-*`。README 补全首次使用、主线与旁问、费用口径和四模式任务示例，进阶保护说明保留在折叠区。

## 继续验收

最新补齐工具详情的 5 个缺失输入，当前 50 个结果均验证展开与窄屏布局；技能、语音准备和菜单材质回归通过。原生 Claude Code SDK/CLI 已经受控本地模型接口完成 Linux 与 Windows 全流程，完整平台记录分别核验，旧会话输入未改。7 文件 16 项 Linux 回归和 3 项 Windows 回归通过，菜单另有 24 项通过记录。中断对话测试已补入 Host 类型检查入口。[记录](requirements/2026-11-15-regression-baseline.md#工具详情技能入口与原生子代理)

后续两批共 12 文件、39 项只读回归通过：长历史/流式输出、后台任务、子对话/分叉/工作流，以及模式配置和插件导航。输入预测消耗回放响应的问题已由事件日志定位；旧 Creator 输入保留，当前显式可选组合使用独立输出预期。详见[回归记录](requirements/2026-11-15-regression-baseline.md#长历史后台任务与子对话)。这些是测试与文档更新，安装版仍为 `.8`。

OpenAI 编辑入口和原生工作区拖拽曾有间歇超时；保留失败、独立复验及事件记录，不以随后通过代替根因修复。继续处理剩余 Web 失败、原生门户、实体桌面、自动回退/重启、正式更新与外部引擎、可选目标保护联动。许可证仍为 Windows 919 包中 7 项、Linux 921 包中 9 项待审。

原生 Cua Driver 保护入口的源码准入、撤销、审计和关闭等待已验证；当前运行时清单不包含该实验包，不能把源码通过当作产品集成完成。[执行层](requirements/2026-11-02-native-execution.md)

## 恢复入口

- 上一版 `.7` 程序：`D:/DSHU-Backups/20261115T121506Z-20261115-7-installed-program/program`，16,416 文件已校验；其父目录保留清单。
- 安装前数据：`D:/DSHU-Backups/20261115T124021Z-before-20261115-8-data`，7,318 文件已校验，限当前用户、SYSTEM 和管理员访问。自动回退仍未验收。
- 当前回执：`current-windows-manifest.json`、`current-linux-manifest.json`、`installed-update-result.json`、`installed-runtime-result.json`、`installed-cli-version.json`、`linux-native-x11-8-startup.json`、`linux-native-wayland-8.json` 和 `delivery-index.json`。
- `.7` 回执保留在 `accepted-2026.11.15.7`，更早安装包、备份和失败记录继续保留。

## 清理与工作约束

第 8 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T12-15-21.912Z-28UNek/win-unpacked` 已核验 16,410 文件、1,590,704,861 字节，无链接或进程引用，恢复安装器与实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，未换方式重试。记录为 `windows-unpacked-8-cleanup-rejected.json`。

第 7 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T10-08-04.390Z-pQnbhz/win-unpacked` 已核验 16,410 文件、1,590,704,440 字节，无链接或进程引用，恢复安装器与实装检查通过。删除仍被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 保留，未换方式重试。记录为 `windows-unpacked-7-cleanup-rejected.json`。

第 6 版重复目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T09-12-09.714Z-r9RSGc/win-unpacked` 已核验 16,411 文件、1,590,690,261 字节，无链接或进程引用，恢复安装器及实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，没有重试。记录为 `windows-unpacked-6-cleanup-rejected.json`。

第 5 版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T06-15-31.325Z-BsBDM7/win-unpacked` 已核验：16,411 文件、1,590,687,914 字节，无链接、无进程引用；恢复安装器和实装检查通过。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，没有重试；回执为 `windows-unpacked-5-cleanup-rejected.json`。此前被拒绝的路径同样保留，不换方式重试。


此前已删除约 2.92 GiB 的 Linux 旧解包逻辑数据；未把它当作 Windows 宿主即时释放量。历史上约 5.78 GiB、两个构建目录及 C 盘约 1.9 GiB 旧解包目录的删除被自动审批以 `blocked by policy` 拒绝，仍保留，没有换方式重试。此前已核验 `.2` 的旧 Windows 解包目录 `D:/DSHU-Delivery-Work/20261115/installer-check-CtUwda`：16,422 个文件、2,035,029,157 字节、无链接或进程引用，原安装包摘要一致。其删除同样被自动审批以 `blocked by policy` 拒绝；约 1.90 GiB 仍保留，未换方式重试，回执为 `old-windows-2-extraction-cleanup-rejected.json`。第 4 版重复构建目录 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/runs/2026-11-15T03-41-25.591Z-vBjugI/win-unpacked` 也已核验：16,411 文件、1,590,687,931 字节、无链接和进程引用，安装器与已安装版本均已验证。删除被自动审批以 `blocked by policy` 拒绝，约 1.48 GiB 仍保留，未换方式重试；回执为 `windows-unpacked-4-cleanup-rejected.json`。安装包、备份和回执继续保留。

继续时读取 TODO 并核对实际工作树与安装版本。保持 main、中文提交、正常 Git hooks，不使用 Computer Use。进阶目标保护和所有限额默认关闭；保护按域名/主机规则、服务器/数据库、审计联动顺序推进。
