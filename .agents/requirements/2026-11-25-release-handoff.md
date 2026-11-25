# DSHU 下一版接手文档

更新于 2026-11-25。面向接手主线开发、专项模式、桌面安装和发行验收的维护者。正式版须交付缺省、写作、网安、逆向四种模式。通用与写作候选可以独立验证和推送。涉及自动攻击、漏洞利用的专项执行链由维护者接手，专项验收完成前，完整内核升级和新版发行保持待完成。

[版本身份](#版本身份) · [七项需求](#七项需求如何验收) · [复现](#从干净目录复现) · [保留资料](#旧资料与问题-20) · [平台验收](#桌面与平台验收) · [交付顺序](#交付顺序与接手责任)

## 版本身份

| 要核对的对象 | 当前依据 | 能据此确认的范围 |
| --- | --- | --- |
| GitHub 正式版 | [v2026.11.24.3](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.24.3) 是 Latest，另有 [v2026.11.23.0](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.23.0)。两版各有 10 个附件。 | 供用户下载、取旧安装器和比对更新入口。安装包的版本与开发截图分别核对。 |
| DSHU 主线 | [d8798268b4](https://github.com/Water-Run/deepseek-harness-uncensored/commit/d8798268b4acd1f732811320ba946422ce47b4a0) 是本轮界面、记忆总开关、余额历史和旧 profile 解析的起点。根 [product.json](../../product.json) 声明内核 `0.2.2-rc.5`。 | 在仓库根目录启动和构建得到此源码线。主线版本信息只有在实际替换并验收桌面载荷后才能随之更新。 |
| DSH 新内核 | 目标为上游 [dsh-v0.2.3-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.3-alpha.2)，固定提交 `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。 | 已纳入 Git 的候选由 [source.json](../../kernel/0.2.3-alpha.2/source.json) 的 `tree` 唯一标识。上游提交、候选 Git 树、DSHU 日期版本是三种不同的标识。 |
| 旧资料基准 | [跨版本资料验证器](../../scripts/verify-kernel-released-data.mjs) 固定旧端源码节点 `95325688c9134480b7289341ed4eda26e40a55d0`。 | 旧版进程写入样本，新版进程读取、修改并冷启动复核。正式发行还需从当前线上版本的实际安装副本升级。 |

## 七项需求如何验收

| 需求 | 主线已交付与入口 | 在最终发行候选上要取得的证据 |
| --- | --- | --- |
| 1. 新版 DSH 内核与 Issue #20 | 主线和固定候选都处理了旧 profile 优先装入同名 DSH 包的问题。通用与写作候选可从固定上游还原。 | 完整四模式装配、CLI、桌面 Host、关于页和安装器报告一致的内核。macOS 保留旧 profile 升级后打开原会话。见下方专项验收。 |
| 2. 关于页 | 桌面弹窗左侧渐变贴齐上、下、左三边，顶部没有可见的“关于”标题。手机端渐变铺满顶部，关闭按钮可达。右侧展示来源、编译信息和许可。 | 中文、英文分别检查 1440×900、1280×720 和 390 像素宽。桌面不出现多余滚动，移动端滚动后仍能关闭。对照[桌面](../../docs/assets/dshu/about.webp)与[手机](../../docs/assets/dshu/about-mobile.webp)实拍。 |
| 3. 跨对话记忆 | 设置 → 通用。总开关默认关闭，自动提炼单独启用。用户可管理已保存记录。 | 新资料默认状态、开关重载、跨会话检索、作用域、修订去重、关闭后保留记录均在同一候选验证。另用旧版本产生的真实资料文件检查读取和冷重启。 |
| 4. 自动清理 | 设置 → 额度 → 采样设置。新资料按时间自动清理，保留 30 天。显式保存的其他策略继续生效。 | 各准备一份全新配置和一份显式关闭清理的旧配置。按账户写入采样，核对界限内外记录、旧选择、账户切换和重启。 |
| 5. 余额范围 | 设置图表左右两个把手分别控制起点和终点。侧栏有独立开关和短、中、长三档，对应 24 小时、7 天、30 天，默认显示中档。 | 用超过屏幕宽度的采样集，鼠标拖动两个端点，再用键盘检查首尾、小额变化与原始时间。隐藏侧栏后，设置中的留存历史仍能查询。 |
| 6. 额度与模式设置 | [额度设置](../../docs/assets/dshu/balance.webp)与[模式设置](../../docs/assets/dshu/mode-settings.webp)已更新。 | 在宽屏与窄屏检查浅深主题、焦点、已选模式和设置入口。额度页同时核对自动清理、采样控制和图表读数。 |
| 7. 移除插件“更多” | 左侧快捷导航移除了能打开“浏览更多插件 / 创建你的插件”的按钮。底部“更多”是账号菜单，可打开关于页。 | 核对左侧导航没有插件入口，再分别从设置进入插件页、从账号菜单打开关于页。见[侧栏实拍](../../docs/assets/dshu/sidebar.webp)。 |

[用户 README](../../README.md) 说明当前源码功能，下载链接指向线上正式版。用户可见的默认值、入口或截图变化时，一起更新[使用手册](../../docs/user/guide/dshu.md)、对应包的 README 和[默认值升级指南](../../docs/upgrade-guide/v0.2.2-rc.5/memory-and-balance-defaults/guide.zh.md)。

## 从干净目录复现

### 主线

先用 `git status --short --branch` 确认没有把本机资料或交付物混入提交。通过 `git ls-remote origin refs/heads/main` 核对远端分支。根目录使用本项目 [package.json](../../package.json) 指定的 Node、pnpm 和锁文件。下面的 Web 场景使用测试资料目录和本地测试适配器，无需真实账户。

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run test:web:built apps/web/tests/about-dialog-fit.e2e.ts apps/web/tests/balance-cleanup.e2e.ts apps/web/tests/balance-history-layout.e2e.ts apps/web/tests/memory-preference.e2e.ts --maxWorkers=1
pnpm run test:web:built apps/web/tests/agent-preset-authoring.e2e.ts apps/web/tests/entry-customization.e2e.ts --maxWorkers=1
pnpm run doc-sync
pnpm run verify-upgrade-guides
```

上述首个里程碑在 Windows x64 上通过 429 项定向测试、主线构建 10 项以及 Git 推送前类型检查 5 项。浏览器已实际检查关于页布局、两个范围把手和记忆开关。四组旧 Web 录制回放在 Windows 未全绿，差异包括 `bash` 与 `pwsh`、平台技能目录及既有系统提示词断言。应在支持的 Unix 平台独立运行这些场景并检查实际差异。保留原始失败日志与对应提交，避免把一个平台的录制覆盖到所有平台。

### 固定内核候选

在主线根目录执行还原脚本。脚本要求新目录，校验固定上游提交，应用已提交补丁，并比较还原出的 Git 树。候选使用 Node `24.22.3`、pnpm `11.28.5`。本机其他仓库的全局依赖不作为验收依据。

```sh
node scripts/prepare-kernel-candidate.mjs .artifacts/review-alpha
cd .artifacts/review-alpha
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm run build
git write-tree
pnpm exec vitest run --maxWorkers=1 packages/boot/app-boot/tests/profile-resolution.spec.ts
```

旧 profile 修复对应的候选树 `2eb4efd39dfe10723274f75bae5cdedbad11be35` 在 Windows x64 完成过冻结安装、10 项构建和 234 项解析测试。后续候选变更应分别记录自己的树、构建和受影响的行为测试。源码树与构建结果都不能替代桌面安装验证。

### 跨对话记忆的候选验收

记忆里程碑的 Git 树为 `92f2d6eb4be9ffdb7117fa2db36d95bd4dee683c`。候选在缺省与写作预设接入记忆，用同一个 Host 服务提供存储、设置与管理。Windows x64 已完成冻结安装和 10 项构建检查，8 个测试文件共 59 项通过。真实 Chromium 场景从设置启用记忆，确认自动提炼仍关闭，重载页面后关闭记忆，再打开管理页读取之前的记录。

从已完成构建的候选目录运行以下两条命令。第一条覆盖记忆存储、检索、权限、设置、选择控件和会话费用。第二条启动 Web Host 与 Chromium，截图写入候选目录的 `.artifacts/screenshots/memory/manager.png`。

```sh
pnpm exec vitest run --maxWorkers=2 packages/memory/memory/tests packages/api/memory-controller/tests packages/client/ui-settings-memory/tests packages/guard/spend-limit/tests/session-usage.spec.ts packages/client/ui-primitives/tests/select.client.spec.tsx
pnpm run test:web:built apps/web/tests/memory-preference.e2e.ts --maxWorkers=1
```

| 接手时遇到的现象 | 首先核对 | 验收依据 |
| --- | --- | --- |
| 开关首次出现就是开启 | 确认使用空的临时资料和设置 → 通用，分别读取总开关与自动提炼的状态。 | 空资料默认关闭；启用总开关后，自动提炼仍须单独开启。 |
| 记忆没有出现在另一条对话 | 在管理页核对记录是否启用、工作区、模式和内容修订号。在同一工作区的写作对话检索一遍，再换工作区或模式复测。 | 在匹配范围读取最新内容；仅写作可用的记录不得进入缺省模式。查看[记忆服务](../../packages/memory/memory/README.md)。 |
| 关闭后看见历史记录 | 从管理页核对已有记录，再在新对话中检查是否有新的自动检索、写入或提炼。 | 总开关关闭会停止对话使用记忆，管理页仍能查看和编辑已保存的记录。 |
| 升级后记忆丢失或重复 | 保留原件，在副本上运行下节的跨版本验证器。分别记录原始文件摘要、记录 ID、版本、作用域和启用状态。 | 旧端写入两条写作记录并禁用其中一条；候选修改另一条，下一进程读到版本 2 和修改后的内容，禁用记录仍然保留。 |

同一次运行使用三个独立进程写入旧资料、读取并修改副本、冷启动重读副本。每阶段的 5 组用例均已通过，原始目录的 16 份文件 SHA-256 一致。候选读端分别使用 Node 24.22.3 和 Windows Electron 44.11.5 的内置 Node 验证。该结果覆盖受控资料。线上安装的实际升级仍按平台表验收。

### 余额与左侧导航的候选验收

候选树为 `f8581330d1bc002e1660542428cc6237f12cd211`。设置 → 额度同时展示账户余额采样与已有的滚动额度限制。侧栏可以独立隐藏。左侧导航直接提供已注册的面板入口，插件“更多”按钮已经移除。底部账户菜单和其他区域的操作仍按各自权限提供。

| 操作 | 预期结果 |
| --- | --- |
| 使用新资料，展开「采样设置」 | 自动清理按天数，保留天数为 30。切换到按条数或关闭后重开设置，显示显式保存的策略。自动清理在写入新采样时执行。 |
| 用 500 条含微小涨跌的样本打开设置 | 设置读取全量留存原始采样。分别拖动起点、终点，或将焦点移至把手后按方向键，图表随所选区间变化。聚焦曲线后可用 Home、End 读出区间内首尾的原始时间和金额。 |
| 在侧栏切换短、中、长，再关闭显示 | 三档分别为距最新采样 24 小时、7 天、30 天。关闭侧栏显示后，设置中的留存历史依然可用。侧栏仅传输有上限的图表点，设置页使用完整区间。 |
| 切换账户或撤销访问 | 旧余额在请求新资料前清除。旧身份迟到的响应不能写入当前账户。未登录且无 API Key 时显示凭据提示，不能用零替代失败的余额读数。 |
| 从左侧打开自动化任务或插件，刷新再试 | 仍能直接进入相应面板。左侧导航的“更多”不会重现。设置中的账号菜单和会话视图属于不同入口。 |

Windows x64 下，冻结锁文件校验通过，完整构建 10 项通过。余额、导航与远端访问分类共 13 个测试文件、103 项通过。真实 Web 回归另行验证清理、历史图、直接导航，以及在合并的额度页面继续调整滚动窗口。

在完成构建的候选根目录执行以下命令。浏览器场景用隔离资料和可重复的采样，不需要真实扣费。余额页面的浅深色截图保存在 `.artifacts/screenshots/balance-history-layout/` 和 `.artifacts/screenshots/balance-precision/`。切换服务商实际凭据与计费对账由有测试账户的维护者验收。

```sh
pnpm exec vitest run --maxWorkers=2 packages/credentials/balance/tests packages/client/ui-settings-account/tests/balance- packages/client/ui-settings-account/tests/rolling-amount packages/client/ui-settings-account/tests/formatBalance packages/client/ui-entry-customization/tests packages/experimental/liveshare/tests/endpoint-classification
pnpm run test:web:built apps/web/tests/balance-cleanup.e2e.ts apps/web/tests/balance-history-layout.e2e.ts apps/web/tests/entry-customization.e2e.ts apps/web/tests/writing-spending-settings.e2e.ts --maxWorkers=1
```

### 通用界面的代码入口与正式版复验

| 功能 | 主线实现与用例 | 在候选上需补的证据 |
| --- | --- | --- |
| 账户余额与保留期限 | [采样和清理](../../packages/credentials/balance/src/engine.ts)、[Host 注册与配置](../../packages/credentials/balance/src/index.ts)、[清理回归](../../apps/web/tests/balance-cleanup.e2e.ts) | 隔离资料目录验证新配置保留 30 天、显式旧配置持续有效，切换账户不会读到另一账户的余额。 |
| 设置与侧栏的余额图 | [图表与把手](../../packages/client/ui-settings-account/src/client/BalanceHistory.tsx)、[设置和侧栏挂载](../../packages/client/ui-settings-account/src/client/balance.ts)、[范围实测](../../apps/web/tests/balance-history-layout.e2e.ts) | 同一数据集上读出最早与最新样本，拖动两端后区间和曲线一起变化。切换侧栏范围或隐藏侧栏，设置中的可查历史保持完整。 |
| 关于页 | [弹窗](../../packages/client/ui-settings-account/src/client/AboutDialog.tsx)、[样式](../../packages/client/ui-settings-account/src/client/AboutDialog.module.css)、[尺寸与焦点回归](../../apps/web/tests/about-dialog-fit.e2e.ts) | 检查桌面渐变贴齐三边，移动端贴齐顶部，关闭按钮和键盘焦点可达。检查标题可供辅助技术读取且没有独立可见标题栏。 |
| 模式设置与左侧导航 | [模式设置界面](../../packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx)、[模式设置回归](../../apps/web/tests/agent-preset-authoring.e2e.ts)、[导航入口回归](../../apps/web/tests/entry-customization.e2e.ts) | 检查外观、选中态、窄屏和插件入口；保留账号菜单的关于入口。四模式的业务验收单独由对应维护者登记。 |

## 旧资料与问题 20

用户在 macOS 上报告应用启动后无法使用，涉及 `workspaceController`。保留资料时，旧 profile 中直接声明的包可能遮蔽桌面 Host 自带的 DSH 服务。修复涵盖 ESM、CommonJS 和插件目录解析，同时保留外部插件使用自己依赖的行为。报告目前仍开放。[Issue #20](https://github.com/Water-Run/deepseek-harness-uncensored/issues/20) · [解析实现](../../packages/boot/app-boot/src/profile-resolution/resolver.ts) · [回归用例](../../packages/boot/app-boot/tests/profile-resolution.spec.ts)

1. 退出应用，记录安装包版本、操作系统、CPU 架构及应用实际使用的资料路径。默认资料根为 `~/.dsh-uncensored`，配置了 `DSH_UNCENSORED_HOME` 时以实际路径为准。
2. 保留升级前的安装器和完整资料副本。在另一个目录进行演练。旧 profile 中的插件和锁文件也属于样本，先删掉它们会掩盖问题。
3. 在 macOS arm64 先走保留资料升级，再走全新资料启动作为对照。检查启动日志中实际解析的 Host 包、工作区列表、能否打开旧会话并在新会话中工作。记录安装包、版本、错误信息与结果。对外共享日志前移除凭据和私人会话内容。
4. 安装后若发生已知资料只读失败、记录数量异常或工作区无法载入，保留失败副本与日志。用升级前安装器搭配升级前资料副本恢复。已经迁移过的 SQLite 文件不能交给旧版直接写入。
5. 仓库内的跨版本验证使用受控样本。把旧版 checkout、新还原的候选及可选的 Electron 可执行文件传给验证器。它先校验两个源码目录，创建一次性资料，复制后运行新端，在独立进程中重新打开，并比较原副本的 SHA-256。阶段失败时脚本打印保留目录。

```sh
git worktree add --detach .artifacts/review-old 95325688c9134480b7289341ed4eda26e40a55d0
cd .artifacts/review-old
pnpm install --frozen-lockfile
pnpm run build
cd ../..
node scripts/verify-kernel-released-data.mjs .artifacts/review-old .artifacts/review-alpha
```

复验 Electron 时，在验证命令末尾追加已核对版本和摘要的 Electron 可执行文件路径。旧端仍用 Node 写入，两个候选读进程使用 Electron 内置 Node。若提示树不匹配，回到还原步骤核对提交与暂存树。验证器会拒绝修改过的旧端和不匹配的候选。

重点核对工作区标识、写作资料选择、滚动额度、会话事件和多代分叉。记忆要同时核对模型请求里的来源记录、资料库里的文本与修订号、禁用状态、作用域及总开关。账单里出现过提炼费用只证明历史事件能被计价，还需要证明确实能打开、检索和修改资料库。[记忆服务](../../packages/memory/memory/README.md) · [账单与迁移记录](2026-11-24-dsh-kernel-upgrade.md)

持久化检查另有一项已知缺口。历史 `target/admission` 事件的两个必填字段缺少兼容性声明。当前通用资料样本覆盖工作区、会话与记忆。持久化维护者须在旧资料副本上验证该类历史事件，登记读取决定，再运行目录与变更声明检查。见[已有会话兼容性缺口](2026-11-24-dsh-kernel-upgrade.md#已有会话兼容性缺口)。

## 桌面与平台验收

| 目标 | 对照安装形式 | 本轮发行候选验收 |
| --- | --- | --- |
| Windows x64 | exe | 从线上版本保留资料升级、附件签名与哈希、实际启动、同版修复、卸载后资料策略。检查短路径和深路径下原生模块与 Office 运行时加载。 |
| Linux x64 | deb、rpm 分别验证 | 记录发行版、包管理器和桌面会话。两种包各自安装、启动、保留资料升级并读取历史会话。 |
| Linux arm64 | deb | 在匹配架构的系统安装，验证随包原生依赖、启动与已有资料。 |
| macOS arm64 | DMG 手动安装，按旧版实际更新索引验证应用内升级 | 记录签名、公证及 Gatekeeper 结果，再做 Issue #20 的保留资料场景。过渡版本的旧更新器仍可能下载 ZIP。 |

交回平台结果时，每个安装格式单列一行，附上操作系统及架构、原安装版本与候选版本、安装包摘要、首次启动结果、升级后的资料数量和恢复演练结果。若失败，记录首次失败的操作和原始错误，将仍可运行的旧版本与对应备份成对保留。

旧候选的目录包、Electron 运行时和 Windows 安装辅助程序已有独立证据。新发行候选需要按相同源码提交验证具体安装产物。每个目标记录版本、源码提交、候选树、Node/Electron 版本、安装文件名和 SHA-256，以及首次启动和保留资料升级结果。[桌面打包](../../apps/desktop/packaging/README.zh.md) · [Windows 签名](../../apps/desktop/windows-signing/README.md)

## 交付顺序与接手责任

| 里程碑 | 责任与验收 | 可以交接的证据 |
| --- | --- | --- |
| 内核与通用功能 | 固定候选已接入记忆、账户余额、额度设置与左侧导航。接下来由通用维护者接入关于页，核对模式设置界面，并检查桌面集成。按正常 Web/桌面入口检验，不同账户和工作区分别使用测试资料。 | 可还原的补丁和树、冻结安装、构建、定向测试、页面实拍、旧资料复验结果。 |
| 四模式与已有会话 | 产品维护者接手专项执行链。逐项核对四种模式的产品入口、选中状态、既有会话标识和用户资料。历史会话须保留原模式，异常应能定位。 | 各模式对应的负责人、源码或构建标识、保留资料测试结果、剩余缺口。专项执行链的实现和验证由其维护者负责。 |
| 安装升级 | 各平台维护者使用同一源码提交生成候选，完成上表对应操作。 | 安装器清单、摘要、系统版本、签名状态、旧版到候选的升级记录及恢复验证。 |
| 文档与发布 | 发行维护者核对 README 的默认值、截图和真实附件名，确认关于页与应用报告的版本一致，并检查 Release 更新索引。 | 已核对的正式标签、附件清单、升级指南和各平台结果。验收缺项记录在[交付清单](../TODO.md)。 |

每个可验收节点由实施者自行推送一次，连续的局部修正合并到同一节点。推送前核对变更范围、相关测试和暂存内容。正常推送后比较 `git rev-parse HEAD` 与 `git ls-remote origin refs/heads/main`，将提交号和验证结果交给下一个接手人。[仓库推送检查](../skills/dsh-pre-push-checks/SKILL.md)

### Release 维护记录

`v2026.11.17.3`、`v2026.11.17.4`、`v2026.11.17.5` 三个旧草稿已删除。清理前逐一备份草稿正文与 12 个附件，并按 GitHub 的 SHA-256 核验。本机备份位于 `D:/DSHU-Backups/release-drafts-20261125/`，每个版本目录含 `release.json` 和四个附件。清理后核对结果为 0 个草稿、2 个正式版。后续发版先查询实际状态，避免把历史备份或源码里程碑当成公开发行。

```sh
gh api --paginate repos/Water-Run/deepseek-harness-uncensored/releases --jq '.[] | [.tag_name,.draft,.prerelease,(.assets|length)] | @tsv'
gh api repos/Water-Run/deepseek-harness-uncensored/releases/latest --jq '.tag_name'
```
