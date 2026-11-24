# DSHU 下一版 TODO 清单（全量）

下一版 = `v2026.11.23.0` 之后的所有提交。已发行版之后进入 `main` 的 **10 个提交全部属于本版**，已实现的功能、内核候选、发行链路与破甲升级都记在这张表里。

上位文档：[接盘路线](../../.artifacts/DSHU-next-agent-prompt.md) · [内核升级计划](2026-11-24-dsh-kernel-upgrade.md) · [破甲总计划](2026-11-24-armor-next-release-plan.md) · [破甲逐项清单](2026-11-24-armor-todo.md)

图例：`[x]` 已完成（有证据）· `[!]` 待决（阻塞后续）· `[ ]` 未开始

统计：**已完成 48 / 待决 4 / 未开始 39**，合计 91 项。

## A 已完成

### A-0 自 `v2026.11.23.0` 以来的提交台账（10 个）

- [x] A1 `dd275b1f2b`（2026-11-23）README 结尾加 LINUX DO 友链，1 文件 +4。
- [x] A2 `e89e7e7aed`（2026-11-23）README 下载行去掉 zip 说明，与只发安装包的发布形态一致，1 文件。
- [x] A3 `3a5647838c`（2026-11-24）正式支持写作资料与多窗口额度，统一旁问状态与余额曲线，46 文件 +559/−252。[nov24-roadmap-main-ui.log](../../.artifacts/nov24-roadmap-main-ui.log)
- [x] A4 `5a14a053d6`（2026-11-24）合入通用会话内核，校验多级分叉计费与写作上下文，37 文件 +1427/−721。[alpha-session-green.log](../../.artifacts/alpha-session-green.log)
- [x] A5 `c611489e39`（2026-11-24）固定 alpha.2 候选并贯通写作设置、额度限制与恢复，6 文件 +12301（含固定候选源与还原脚本）。[kernel/0.2.3-alpha.2/source.json](../../kernel/0.2.3-alpha.2/source.json)
- [x] A6 `cae3fda41d`（2026-11-24）统一桌面更新来源，保留 macOS 安装与更新入口，26 文件 +1271/−482。[alpha-single-feed-check.log](../../.artifacts/alpha-single-feed-check.log)
- [x] A7 `73574183f2`（2026-11-24）用正式版资料复验工作区、写作记忆与多代会话费用，6 文件 +2893/−596。[alpha-final-data-node.log](../../.artifacts/alpha-final-data-node.log)
- [x] A8 `a46caedb66`（2026-11-24）修复 Windows 终端退出并验证安装器编译工具链，4 文件 +254/−5。[alpha-desktop-vs-preflight-pass.log](../../.artifacts/alpha-desktop-vs-preflight-pass.log)
- [x] A9 `8ed882f27a`（2026-11-24）恢复 alpha.2 会话费用入口并复验 Windows 桌面运行时，4 文件 +1460/−38。[alpha-footer-chart.log](../../.artifacts/alpha-footer-chart.log)
- [x] A10 `473891723e`（2026-11-24）统一使用最新正式 Release，过渡后仅发布五个平台安装包，21 文件 +637/−36。[nov24-release-complete-tests.log](../../.artifacts/nov24-release-complete-tests.log)

### A-1 界面与交互

- [x] A11 旁问运行时状态圈改为等长旋转虚线：周长归一化 64，虚线与间隔各 4，闭合处成完整周期（`3a5647838c`；30 项通过）。（还差：候选中三情形核对）
- [x] A12 旁问灯与按钮一起悬浮，左上各 −1 px；空/无旁问无灯，运行中主题色呼吸，结束未读静止，已读灰静，停止或异常警告色静止；覆盖已读重载与新一带空旁问（`3a5647838c`）。（还差：候选中接回标题栏与侧栏入口）
- [x] A13 余额曲线短横线连续：按实际渲染尺寸，5 px 虚线 / 4 px 间隔，长度不足 14 px 画实线，阈值两侧有测试（`3a5647838c`）。（还差：账户余额采样进设置与侧栏）
- [x] A14 会话费用入口：输入框下方展开累计费用与各窗口占用，费率或用量不全显示已知下限；覆盖窗口、权限撤销、弹层焦点、精度与虚线阈值（`8ed882f27a`）。
- [x] A15 真实 Web Host 双会话验证：分别显示 1.00 元与 0.000216 元，1280 / 390 视口 Home / End / Escape 可达（`8ed882f27a`）。
- [x] A16 统一更新源设置项：设置与预加载入口移除渠道选择，安装包从自身配置读 `latest`；旧设置 `nightly` / `latest` / 无效值覆盖于启动测试，5 文件 225 项通过（`cae3fda41d`）。
- [x] A17 候选在旧桌面壳仍提供渠道接口时不再重注册选择行：设置注册与生命周期 12 项、桌面启动与源选择 200 项、Web 五文件 18 项通过（`cae3fda41d`）。

### A-2 内核与数据

- [x] A18 固定内核候选：tag `dsh-v0.2.3-alpha.2`、base `4b399c39a6d1`、树 `8ffb1ff8`，还原脚本校验 `write-tree`（`c611489e39`）。
- [x] A19 上游试合并与冲突清点：7,312 文件变化，909 冲突路径（包 301、快照 245、应用 193、维护资料 71、文档 40、GitHub 配置 29、脚本 20、其余 10）。[dshu-kernel-merge.txt](../../.artifacts/dshu-kernel-merge.txt)
- [x] A20 候选冻结锁文件安装、ConPTY 子进程检查、8 项产物构建与 2 项聚合类型检查通过。[alpha-candidate-build-current.log](../../.artifacts/alpha-candidate-build-current.log)
- [x] A21 写作、额度、预设与旧桌面接口联合回归 18 项通过；增补普通 v4 提示与两种新来源读取后写作与文档规范 30 项通过。
- [x] A22 正式版 15 份资料跨版本复验：写作资料顺序与撤回、额度双窗口、会话头与事件、三代连续分叉估价、工作区索引与置顶归档，备份 15 文件 SHA-256 前后一致（`73574183f2`）。
- [x] A23 记忆兼容：旧写作会话含必读 `memory/extraction` 事件可打开，三次独立进程各 4 项通过，候选树 `85d684c70d`（`73574183f2`）。
- [x] A24 Windows 终端自然退出修复：管道关闭时 node-pty 释放转发线程，真实子进程服务与宿主自然退出通过（Electron 44.11.5 单次 4.5 秒），候选树 `a9ac108e`（`a46caedb66`）。
- [x] A25 安装器编译工具链改用 `vswhere -latest -prerelease` 定位 x86/x64 C++ 组件，预检通过并实际编译 `window-frame.dll` 与五个测试程序（`a46caedb66`）。
- [x] A26 Windows 目录包短路径通过 EXE / ASAR / 原生模块 / 终端 / Office 转换的 `smokePreparedRuntime`；长路径 `lxml._elementpath` 失败归因路径长度。[alpha-desktop-unsigned-dir.log](../../.artifacts/alpha-desktop-unsigned-dir.log)
- [x] A27 macOS 首装与更新索引核对：`latest-mac.yml` 的 `files` 与 `path` 同指 497,240,952 字节 ZIP，更新器选 ZIP 排除 DMG（`cae3fda41d`）。

### A-3 功能转正

- [x] A28 文风卡与设定集正式支持：按选择进入写作上下文，取消勾选产生撤回提示，压缩后重新注入，普通模式隔离，中文与 emoji 字节预算有测试（`3a5647838c`）。
- [x] A29 叠加额度与自动恢复正式支持：六档滚动窗口叠加、并发预留、取消、手动暂停、继承消费、冷恢复；Web Host 演练双窗口重置后只发一次请求（`3a5647838c`）。
- [x] A30 模式主题、通用动效与四模式选择保持通过（沿用 18.x 基线，[Web 回归](2026-11-16-regression-followup.md) 1,087 项）。

### A-4 发行与治理

- [x] A31 单一最新 Release 与过渡清单：常规 5 附件、`--bridge` 10 附件；客户端核对日期版本、固定标签地址、大小、GitHub SHA-256 与下载 SHA-512（`473891723e`）。
- [x] A32 真实线上版本检查：Windows Electron 44.7.0 用真实 NSIS 更新器查询线上正式版，正确返回当前版本无更新。[nov24-live-observation.txt](../../.artifacts/nov24-live-observation.txt)
- [x] A33 候选 `doc-sync` 43 项并行 42 项通过，CLI 帮助子进程超时单独复跑 7 页一致。[alpha-doc-verified.log](../../.artifacts/alpha-doc-verified.log)
- [x] A34 全部提交按功能节点入 `main`，本地与远端仅 `main`，历史 Release、标签、附件与草稿保留。
- [x] A35 文档与交接：接盘 Prompt、内核升级计划、破甲三份文档与本清单互链。

### A-5 破甲轨道已完成

- [x] A36 核对社区版身份与发行：`kingcharleslzy-ai/dsh-purge`、MIT、`v1.7.20`（2026-11-17）、`master` HEAD `e519253d`、tgz sha256 `5b3d66e8…`。
- [x] A37 摸清社区版机制：`resolveInjectText` 三级取值 + `ensureOperatorBody` + `system-prompt/assemble` 前置重排；86 条宿主锚点补丁；25 层自检；备份回滚；`refusal-retry` 三臂与四个审计标签。
- [x] A38 定位 DSHU 侧接缝：`agent/turn-stopping`（`agent.ts:402`）、`agent.steer` / `followup`、`MessageSourceMap`、`spend-limit` 续跑先例、`snapshotEvents` 读最后一条 assistant 消息。
- [x] A39 量化现状：`armor-probe` 2026-11-19 基线 armor 臂完整交付 90% / 拒答开头 10% / 前缀约 6.5k token，bare 臂 36% / 62%；剩余空间只在 `fraud` 50% 与 `forge` 83%。
- [x] A40 决策：正文层已饱和，效果杠杆在宿主句式与运行时重试，排序机制优先、正文最后。
- [x] A41 产出破甲三份文档与 63 项逐项清单。
- [x] A42 接盘基线核对：`main` @ `473891723e`；`dshu.patch` 触及 `tsconfig.host.json` 与 `bundle/base` 两文件（破甲注册面），未触及文本层与快照。

### A-6 前版成果（本版不重复施工）

- [x] A43 四模式与默认规则、已有对话模式锁定、首次网安责任确认。
- [x] A44 旁问 /side、随问 /btw、旁问上下文清理、旁问传图、对话删除。
- [x] A45 余额与统计、额度限制与自动续跑、跨对话记忆、输入预测与 Tab 预填充。
- [x] A46 逆向能力与外部工具接入（内置 REA；目录、JS、Ghidra 与自建 Frida 目标已验收）。
- [x] A47 独立 DSHU 安装器、黑化 Logo 与品牌统一、窄屏底栏、模式指示悬浮、统一下拉控件。
- [x] A48 依赖许可证审计主体（Windows 18.11 实包 920 包 / 931 份声明摘要一致，35 份补充声明按实包复算）。

## B 待决（阻塞后续）

- [!] B1 产品范围决定：下一版可交付的模式清单、CLI、桌面与旧会话入口，以及"自动化攻击或漏洞利用执行链"登记为范围缺口后的用户可见说法。[接盘路线第 1 步](../../.artifacts/DSHU-next-agent-prompt.md)
- [!] B2 破甲 D1：web 四预设官方身份句改为清空 / 中性句（建议 `minimal` 清空、`standard` / `ptc` 中性句）。
- [!] B3 破甲 D4：若 B1 收窄模式，Wave 2 同步删除破甲文本里对已移除能力的承诺。
- [!] B4 破甲落点与 Credit 措辞：确认两波落点与[总计划 4.1](2026-11-24-armor-next-release-plan.md) 的署名文案。

## C 产品装配与数据兼容（未开始）

- [ ] C1 以固定树为基准把主线产品身份接回产品入口：`product.json`、`apps/desktop/scripts/package-target.ts`、`prepare-dsh.ts`、`electron-builder-config.mjs`、`src/release.ts`、`src/update-coordinator.ts`。
- [ ] C2 核对应用 ID、资料目录与签名/发布者身份，使 CLI、桌面关于页、包内 manifest 与运行时描述显示同一日期版。
- [ ] C3 候选壳启用 DSHU 日期版本与唯一更新源，移除上游 `stable/nightly` 约定。
- [ ] C4 把 `3a5647838c` 的两处界面装回候选标题栏与侧栏入口，用真 Host 验证状态同步、重开、键盘焦点、悬浮与减少动画。
- [ ] C5 账户余额采样接入设置与侧栏（账户采样 → 历史存储 → 绘制），复验短横线阈值与缩放。
- [ ] C6 补齐历史事件 `target/admission` 的 `peers` / `target` 兼容声明，用旧事件资料验证读取与重放，复跑 `pnpm exec tsx scripts/persistence-changes.ts --check`（交接遗漏 1）。
- [ ] C7 旧版完整记忆库与实时检索、其他历史必读事件的读取验证。
- [ ] C8 隔离资料中执行安装器原地升级并保留备份摘要。

## D 功能复验（未开始）

- [ ] D1 在 C1 同一候选上复跑 A-1 全部界面项，产出宽屏/窄屏、浅/深色截图。
- [ ] D2 文风卡与设定集在最终打包产品重做创建、编辑、撤回、压缩、重开，比对模型输入与会话日志。
- [ ] D3 额度"不点重置、最后一个窗口自然到期、由轮询接续"（交接遗漏 3）。
- [ ] D4 关闭自动恢复时保持暂停且可手动继续（交接遗漏 3）。
- [ ] D5 余额曲线真实序列、窄屏与浅深色（交接遗漏 4）。
- [ ] D6 受控账户真实计费对账，区分本地估算、实际账单与缺失费率，含记忆提炼费用。
- [ ] D7 四模式各起一次真实会话，确认新内核下模式与预设可用。
- [ ] D8 两套 SDK 对旧日志配对回放：普通、写作、分叉、中断四类（交接遗漏 2）。
- [ ] D9 归档升级前后文件摘要、回放差异与兼容检查结果。

## E 破甲升级（未开始，明细见 [逐项清单](2026-11-24-armor-todo.md)）

- [ ] E1 Wave 1 溯源与 Credit：`product.json`、构建环境变量、关于页、三个 fixture、README 版本表与 Credit、两个 LICENSE、第三方声明、用户指南、升级指南（12 项）。
- [ ] E2 Wave 1 `refusal-retry` 新包：骨架、事件声明、判定器、三臂、apply、测试、README、覆盖率（8 项）。
- [ ] E3 Wave 1 探针台入库与扩展：`scripts/armor-probe/**` 纳管、33 条探针、负对照列、基线记录（4 项）。
- [ ] E4 Wave 2 文本层：引言强句、审批句、sdk-minimal 终端句、定向 persona 规则、boost 段、核文本拆分与锁定、`sync-armor-core.mjs`、web 预设身份句（9 项）。
- [ ] E5 Wave 2 注册合并与候选重建：`tsconfig.host.json`、base 依赖与挂载行、重生成 `dshu.patch`、更新 `source.json.tree` 并通过树校验（5 项）。
- [ ] E6 Wave 2 快照与 SDK：112 个 `system-prompt*.expected.md` 一次重录、无密钥复核、两套 SDK 预期、生成物刷新（4 项）。
- [ ] E7 评测闸门：全量 33 探针、`fraud` / `forge` 定向、重试命中率、成本、负对照、四模式、生产配置、压缩重放（9 项）。

## F 分平台实装与发布（未开始）

- [ ] F1 准备两个递增日期版本样本，在隔离安装与资料目录执行两跳升级。
- [ ] F2 Windows：发布者身份、重启、长路径、首装/升级/修复/卸载与资料保留（交接遗漏 5）。
- [ ] F3 macOS：签名身份、ZIP 入站、DMG 更新、原生重启与单 DMG 替换。
- [ ] F4 Linux x64 DEB / RPM 与 arm64 DEB：各自包管理器与架构选择。
- [ ] F5 失败与回退演练：失败下载、错误摘要、升级中断后原应用可启动或从备份恢复；禁止旧版写已升级 SQLite（交接遗漏 7）。
- [ ] F6 过渡版发布：`deliver` + `deliver:github --bridge`，10 个附件，回读标签、正文与附件。
- [ ] F7 常规 Release 切换：5 个安装包，验证已装过渡版客户端可完成更新。
- [ ] F8 发布材料：许可、第三方声明、离线资料与运行时清单按最终产物核对，README 旧版本下载链接同步（交接遗漏 6）。
- [ ] F9 `release-notes.md` 覆盖内核变更、破甲来源与行为变更、重试臂开关说明。
- [ ] F10 交付清单记录实际提交、候选树、各目标安装包名与摘要、两跳升级结果与仍待验收项。

## G 顺序约束与风险

- [ ] G1 快照只在产品候选上重录一次，Wave 1 不允许产生任何快照 diff。
- [ ] G2 `dshu.patch` 与 `source.json.tree` 成对更新，以 `prepare-kernel-candidate.mjs` 树号相等为唯一判据。
- [ ] G3 文本层冲突按"重放到候选树"处理，不强行 rebase。
- [ ] G4 破甲文本在 B1 定案后校对，删除对已移除能力的承诺。
- [ ] G5 每个节点开始前记录输入提交、锁文件与运行时版本；失败保留候选日志，用旧安装包与升级前资料副本复验。

## 下一步

B1–B4 决策后按 C1 → C2 → C3 → C4 → C5 → E1 → E2 → E3 推进；其余在候选就绪后按 E4 → E5 → E6 → E7 → D → F 推进。
