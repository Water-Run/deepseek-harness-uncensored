# DSHU 下一版接手文档

更新于 2026-11-25。面向接手主线开发、专项模式、桌面安装和发行验收的维护者。正式版须交付缺省、写作、网安、逆向四种模式。通用与写作候选可以独立验证和推送。涉及自动攻击、漏洞利用的专项执行链由维护者接手，专项验收完成前，完整内核升级和新版发行保持待完成。

[版本身份](#版本身份) · [七项需求](#七项需求如何验收) · [复现](#从干净目录复现) · [保留资料](#旧资料与问题-20) · [平台验收](#桌面与平台验收) · [交付顺序](#交付顺序与接手责任)

## 版本身份

| 要核对的对象 | 当前依据 | 能据此确认的范围 |
| --- | --- | --- |
| GitHub 正式版 | [v2026.11.24.3](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.24.3) 是 Latest，另有 [v2026.11.23.0](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.23.0)。两版各有 10 个附件。 | 供用户下载、取旧安装器和比对更新入口。安装包的版本与开发截图分别核对。 |
| DSHU 主线 | [d8798268b4](https://github.com/Water-Run/deepseek-harness-uncensored/commit/d8798268b4acd1f732811320ba946422ce47b4a0) 是本轮界面、记忆总开关、余额历史和旧 profile 解析的起点。根 [product.json](../../product.json) 声明内核 `0.2.2-rc.5`。 | 在仓库根目录启动和构建得到此源码线。主线版本信息只有在实际替换并验收桌面载荷后才能随之更新。 |
| DSH 新内核 | 目标为上游 [dsh-v0.2.3-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.3-alpha.2)，固定提交 `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。 | 已纳入 Git 的候选由 [source.json](../../kernel/0.2.3-alpha.2/source.json) 的 `tree` 唯一标识。上游提交、候选 Git 树、DSHU 日期版本是三种不同的标识。 |
| 旧资料基准 | [跨版本资料验证器](../../scripts/verify-kernel-released-data.mjs) 接受两个已发布节点，分别是 `v2026.11.24.3` 的 `7eaeddc6050e` 和 `v2026.11.23.0` 的 `95325688c913`。 | 旧版进程写入样本，新版进程读取、修改并冷启动复核。Windows x64 已用 Electron 启动候选桌面 Host。Windows 缺省与写作候选的实装覆盖结果见下方“Windows 安装器与版本身份”。 |

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

### 候选文档与接口目录

还原候选后，可从下表中任一 README 进入对应参考。表内路径相对于已还原的候选目录。每份 README 同目录的 `README.zh.md` 提供中文，维护时一起更新两端。

| 候选内的路径 | 在这里核对 |
| --- | --- |
| `packages/memory/memory/README.md` | 工作区与模式的匹配、记忆何时进入日志、提炼费用、关闭和重试、检索与存储上限。 |
| `packages/api/memory-controller/README.md` | 管理权限、写入时的修订检查、来源状态和错误返回。 |
| `packages/client/ui-settings-memory/README.md` | 开关位置、筛选与编辑、冲突后保留草稿，以及从模式设置打开管理页的事件。 |
| `packages/credentials/balance/README.md` | 账户与币种隔离、采样频率、30 天清理、侧栏范围与设置页保留的完整采样。 |
| `docs/subsystems/memory.zh.md` | 查看记忆服务和管理接口的实际方法签名、源文件位置，再进入对应包的使用说明。 |

在候选根目录执行 `pnpm run doc-sync`，同时检查配对、相对链接、包路径、配置和 API 目录、持久化历史及文档网站。接口类型的引用应落在仓库中的 `src/` 声明。修改记忆或余额的子路径后，应再运行 `pnpm run build`，以覆盖 Web 场景和 Host 的聚合类型检查。当前持久化清单与上个候选的 69 个根、696 个结构节点逐项一致，源文件位置已指回记忆包。

本节对应候选树 `159c46d282214d4071486c719b3469b49ff9dcbf`。Windows x64 已从空目录还原并比对树，在配有依赖的候选目录完成全部 43 项文档检查和 10 项构建检查。两个正式版各用独立资料启动候选 Electron Host 并冷重读，每版的 27 个原始文件均通过 SHA-256 核对。

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

### 关于页与模式设置的候选验收

关于页布局首次在候选树 `9a040762398793a9e8e29c8c2c243f167e9fda04` 验收。从账号菜单打开关于页，登录前后都能使用。桌面左侧的渐变贴齐弹窗上、下、左三边，窄屏改为顶部横幅。弹窗通过辅助技术名称标识，右上角关闭按钮固定可达。桌面用 Escape 关闭后，焦点回到账号菜单，可以直接按 Enter 再次打开。[候选桌面实拍](../../docs/assets/dshu/about-candidate.webp) · [候选窄屏实拍](../../docs/assets/dshu/about-candidate-mobile.webp)

| 关于页字段 | 当前候选数据与核对方法 |
| --- | --- |
| DSHU 版本与编译时间 | 左侧显示候选的 DSHU 日期版本 `2026.11.25.0`。当前候选的 CLI 与关于页共用 `apps/cli/package.json` 的 `dshuVersion`，插件兼容性依然按内核版本判断。编译时间以 UTC 显示，显式传入 `DSH_CLIENT_BUILD_TIME` 时必须使用带毫秒的 ISO UTC 时间。GitHub 最新安装包有独立的发行版本。 |
| DSH 内核与源码 | 右侧显示运行内核 `0.2.3-alpha.2`、固定上游提交及其时间。候选源码树取构建时的 Git 暂存树；工作区存在未暂存修改或非忽略的未跟踪文件时，会显示工作区状态。还原后用 `git write-tree` 核对清单。 |
| 组件与许可 | 分别展示 DSHU 和上游许可。dsh-purge Community 1.7.20 与 REA 6.9.0 各自列有许可、来源提交及时间。两项标为发行版清单参考，当前通用源码候选未装配这两个组件。正式安装包另须核对实际载荷。 |
| 桌面原生菜单 | 工作区就绪时通过当前主文档打开同一页面，内嵌的 Platform 视图在关闭后恢复；启动和恢复期间使用原生关于面板。测试覆盖失效文档、延迟加载、订阅清理和菜单回退。设备上的原生安装验收单独记录。 |

设置 → 模式用边框和文字同时标记新任务默认值。可在窄屏查看模式说明、配置和默认状态。关闭开发工具时，写作模式仍可选择。浏览器测试涵盖中英文关于页的 1440、1280、390 像素视口，模式设置的宽窄屏、查看说明、默认值、创建入口和开发工具开关。

在还原并构建的候选根目录运行：

```sh
pnpm exec vitest run --maxWorkers=2 apps/desktop/tests/about-routing.spec.ts apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/platform-view.spec.ts apps/desktop/tests/preload-app.spec.ts packages/client/ui-settings-account/tests/about-controller.client.spec.ts packages/client/ui-settings-account/tests/account.client.spec.tsx packages/client/ui-agent-preset/tests/section.client.spec.tsx packages/client/ui-agent-preset/tests/apply.client.spec.ts
pnpm exec vitest run --maxWorkers=1 scripts/client-build-environment.client.spec.ts
pnpm run test:web:built apps/web/tests/about-dialog-fit.e2e.ts apps/web/tests/agent-preset-authoring.e2e.ts apps/web/tests/developer-tools-settings.e2e.ts --maxWorkers=1
```

### 通用界面的代码入口与正式版复验

| 功能 | 主线实现与用例 | 在候选上需补的证据 |
| --- | --- | --- |
| 账户余额与保留期限 | [采样和清理](../../packages/credentials/balance/src/engine.ts)、[Host 注册与配置](../../packages/credentials/balance/src/index.ts)、[清理回归](../../apps/web/tests/balance-cleanup.e2e.ts) | 隔离资料目录验证新配置保留 30 天、显式旧配置持续有效，切换账户不会读到另一账户的余额。 |
| 设置与侧栏的余额图 | [图表与把手](../../packages/client/ui-settings-account/src/client/BalanceHistory.tsx)、[设置和侧栏挂载](../../packages/client/ui-settings-account/src/client/balance.ts)、[范围实测](../../apps/web/tests/balance-history-layout.e2e.ts) | 同一数据集上读出最早与最新样本，拖动两端后区间和曲线一起变化。切换侧栏范围或隐藏侧栏，设置中的可查历史保持完整。 |
| 关于页 | [弹窗](../../packages/client/ui-settings-account/src/client/AboutDialog.tsx)、[样式](../../packages/client/ui-settings-account/src/client/AboutDialog.module.css)、[尺寸与焦点回归](../../apps/web/tests/about-dialog-fit.e2e.ts) | 检查桌面渐变贴齐三边，移动端贴齐顶部，关闭按钮和键盘焦点可达。检查标题可供辅助技术读取且没有独立可见标题栏。 |
| 模式设置与左侧导航 | [模式设置界面](../../packages/client/ui-agent-preset/src/client/AgentPresetSection.tsx)、[模式设置回归](../../apps/web/tests/agent-preset-authoring.e2e.ts)、[导航入口回归](../../apps/web/tests/entry-customization.e2e.ts) | 检查外观、选中态、窄屏和插件入口；保留账号菜单的关于入口。四模式的业务验收单独由对应维护者登记。 |

## Issue 22 的首轮文件头识别

[Issue #22](https://github.com/Water-Run/deepseek-harness-uncensored/issues/22) 反馈用户必须明确说出 REA，模型才会考虑使用它。DSHU 主线已在启用 REA 的逆向会话中加入首轮文件头识别。该入口面向“这是哪种文件、面向哪种 CPU”一类问题，使用固定版本 REA 的 ELF、PE 和单架构 Mach-O 文件头解码器。通用 alpha 内核候选仍以其关于页的组件状态为准。

1. 启用 REA，打开新的逆向会话。将下方合成文件头连同“这是什么格式、面向哪种 CPU 架构？”作为一条消息发送。问题中无需工具名。用例只使用十六进制数据，无需外部样本或引擎。
2. 首轮系统提示和工具声明中可以看到 `rea_identify_header`。模型调用的参数为 `{}`。工具从当前会话的消息投影中读取最近一条用户原文，接受一个单行或连续多行的十六进制片段，也支持从偏移零开始的标准 `xxd` 和 `xxd -g 1` 输出，上限 4096 字节。读取时会校验每行偏移，跳过右侧字符栏。偏移有缺口或倒序时会报告输入错误。这样保留重复的零字节，也避免把其他会话、工具输出或系统注入的文字当成样本。
3. 核对工具结果为 ELF、机器编号 183、架构 arm64。PE 用例核对 x86_64。macOS 可用 `cffaedfe 0c000001 00000000` 复验单架构 Mach-O，预期编号 16777228、架构 arm64。只给四字节 Mach-O 签名会提示补全至 12 字节。Java 类和通用二进制共享的 FAT 签名不会单凭四字节被判为 Mach-O。未知格式返回空的身份字段，截断、奇数位十六进制和多个分离的片段返回输入错误。关闭 REA 后再次开始一轮，识别工具和提示均应消失。
4. 主线定向测试覆盖原生解码、工具首轮声明、关闭选项与只读权限，并检查没有启动引擎进程。另在隔离的工具集合中用 DeepSeek V4 Flash 和合成文件头做了一次真实选择：用户问题未写 REA，模型自动选择无参数入口，收到工具数据后回答 ELF、ARM64。使用标准 `xxd` 示例复验时，新旧提示都在首轮选中了该工具。相同样本和单一工具下，供应商报告的总输入从 481 降至 475 token（含缓存读取），输出上限为 2048 token。一次将上限设为 384 的试验在工具调用前用尽了输出额度。此处记录的是具体样本，完整工具目录的选择率仍待测量。Issue 保持开放。

```text
7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00
00 00 b7 00 01 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 40 00 00 00 00 00 00 00 00 00 00 00
```

在主线根目录执行 `pnpm exec vitest run packages/mcp/rea/tests/rea.spec.ts -t "header identification|format and architecture"`。[首轮说明与识别实现](../../packages/mcp/rea/src/header-identification.ts) · [行为用例](../../packages/mcp/rea/tests/rea.spec.ts) · [文件头结果快照](../../packages/mcp/rea/tests/expected/file-header.json)

## Issue 25 的工具声明与会话恢复

[Issue #25](https://github.com/Water-Run/deepseek-harness-uncensored/issues/25) 记录了 Windows 正式版 `2026.11.24.3` 在账号登录路径上连续两次被同一工具声明阻断。新版本将原会话可恢复列为优先验收项。主线已修复两个会阻断恢复的环节。REA 设置关闭并保存后，后续步骤排除原先选中的外部工具。一轮因 `INVALID_REQUEST` 结束后，会话也会从后续请求中排除停用工具的历史声明和启停引用。通用内核候选包含会话修复。既有消息、已执行的调用、结果和其他工具保留。

**服务端对照。** 2026-11-25 通过官方 Messages API、API Key 和 `deepseek-flash` 发送相同的短消息，只替换虚构笔记工具的标签约束。每份声明仅含一个工具，实验无需启动第三方进程。下表为实际 HTTP 结果。[复验脚本](../../kernel/0.2.3-alpha.2/verification/mcp-schema-probe.mjs)

| 发送的工具声明 | HTTP | 观察 |
| --- | --- | --- |
| 普通小写字母约束 | 200 | 正常返回消息。 |
| 排除 NUL 和排除 Unicode 代理区的两个约束，嵌在 `allOf` 内 | 400 | 错误点名笔记工具及代理区表达式。 |
| 仅排除 Unicode 代理区 | 400 | 同样被拒。Node 的 `RegExp` 可以编译这一表达式。 |
| 仅排除 NUL | 200 | 正常返回消息。 |
| 报告中给出的否定前瞻样例 | 200 | 此端点接受该样例。其他供应商及表达式须分别实测。 |
| 无工具 | 200 | 普通消息通过。此请求没有用户原会话的历史。 |

**请求与恢复。** 未遇到无效请求时，`in-history` 路由可保留已停用的历史声明以复用前缀。此前这也会把被拒绝的声明再次发出。主线的回环 HTTP 回归分别走 API Key 和账号两条路由，使用虚构的笔记工具和测试凭据。每条路由在同一会话内连续两次收到 400，停用工具后的两次请求均成功并保留首条消息。用例同时核对账号请求头、账号模型目录声明的工具更新模式及 400 后的凭据状态。其他用例覆盖先停用后被拒、先被拒后停用、从初始声明或历史添加中移除、保留其他工具及用户文字，以及限流时继续使用原前缀。主线的设置保存、关闭后的工具声明和执行资格分别经过验证。[主循环](../../packages/core/agent-loop/src/agent.ts) · [请求投影](../../packages/llm/llm/src/content.ts)

在装好依赖的主线根目录运行以下命令。复验还原的候选时，在同一个 PowerShell 窗口切换到候选根目录，再执行第二行。默认只检查本地投影。追加 `--provider` 会用 `DEEPSEEK_API_KEY` 向官方端点发送六个表达式对照请求，随后发送原会话与恢复后请求各一次。首次请求记录 400，恢复后的请求只声明时钟工具，返回 200 并正确答出此前的笔记标签 `ORCHID`。生产会话及其文件均无需提供。

```powershell
$probe = (Resolve-Path kernel/0.2.3-alpha.2/verification/mcp-schema-probe.mjs).Path
node --import tsx/esm $probe
```

[已发布资料验证器](../../scripts/verify-kernel-released-data.mjs)另用 `2026.11.23.0` 和 `2026.11.24.3` 分别写出含工具声明和无效请求错误的压缩 v4 日志。候选树 `75172761e1fc84f0e748533c63a6d19104b08909` 先继续同一会话，再从磁盘重新打开。三种路由均只保留时钟工具与前后两条用户消息。每份旧资料快照的 28 个文件摘要均保持一致。上一正式版的候选读取还在 Electron 44.11.5 中复验。Windows 本地安装器 `bca91a06…` 对应较早的安装器验收节点。

**Windows 安装后的复验。** 将 `mcp-schema-probe.mjs` 复制到测试账户可读的目录。在该目录的 PowerShell 中运行下列命令，从本用户的卸载登记找到真实安装位置。探针从安装目录的 `resources/app.asar` 加载会话和请求投影，离线构造一条失败的笔记对话。旧候选在 `in-history` 步骤退出 1。修复后的三个步骤都须输出 `installed: true`、同一会话标识和唯一的 `clock` 工具，同时保留原笔记标签。账号登录与供应商 HTTP 响应由单独的用例验收。

```powershell
$app = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\4bbab420-ba6b-5135-af15-70ac616e0cb2'
$exe = Join-Path $app.InstallLocation 'DeepSeek Harness Uncensored.exe'
$env:ELECTRON_RUN_AS_NODE = '1'
& $exe --expose-internals .\mcp-schema-probe.mjs --installed | Out-Host
if ($LASTEXITCODE -ne 0) { throw "会话恢复检查失败，退出码 $LASTEXITCODE" }
```

主线的 `dynamic-tool-updates` 无密钥回放在 Windows 上多读到主机自带的 ACL 诊断技能提示，与已提交的跨平台记录相差一条事件。该回放的标准环境为 macOS 或 Linux。Windows 的投影对照、HTTP 回归和旧版本日志复验分别记录。正式验收仍须补跑标准环境的快照。

| 发行前验收 | 通过条件 |
| --- | --- |
| 在原会话自救 | 用户可在宿主设置停用对应服务并保存，再向原会话发送普通消息。REA 总开关影响使用该配置的会话。只在一个会话中单独停用被点名的工具、保留同一服务的其他工具，并以桌面账号登录复验，仍待完成。 |
| 各路由的最终请求 | 首次声明、已有坏历史、重连和不同工具更新模式分别检查。停用后，请求中没有导致拒绝的声明或无效引用，保留已执行调用及其结果。记录实际发送的工具集合，以便回放。 |
| 识别与错误提示 | 对被明确点名且确实随请求发送的工具显示来源和停用入口。模糊 400、权限不足、限流和断线分别呈现。自动重试如有实现，最多一次，且不重复执行工具。工具的本地输入校验继续生效。 |
| 跨供应商与嵌套字段 | 检查根及嵌套属性、数组项、组合与引用定义。按实际供应商结果处理表达式。再测两个有问题的工具、同名工具更换 schema、插件重启及并发窗口，核对停用归属。 |
| 相邻报告 | [#22](https://github.com/Water-Run/deepseek-harness-uncensored/issues/22) 验证工具发现。[#23](https://github.com/Water-Run/deepseek-harness-uncensored/issues/23) 单独验证缓存，固定供应商、模型、消息前缀及工具顺序，比较未变、更改和停用工具三种情况下的请求声明及供应商缓存读数。供应商不报告缓存用量时标为未知。切勿由单次 400 推断缓存失效或改为全量注册。 |

## 旧资料与问题 20

用户在 macOS 上报告应用启动后无法使用，涉及 `workspaceController`。保留资料时，旧 profile 中直接声明的包可能遮蔽桌面 Host 自带的 DSH 服务。修复涵盖 ESM、CommonJS 和插件目录解析，同时保留外部插件使用自己依赖的行为。报告目前仍开放。[Issue #20](https://github.com/Water-Run/deepseek-harness-uncensored/issues/20) · [解析实现](../../packages/boot/app-boot/src/profile-resolution/resolver.ts) · [回归用例](../../packages/boot/app-boot/tests/profile-resolution.spec.ts)

1. 退出应用，记录安装包版本、操作系统、CPU 架构及应用实际使用的资料路径。默认资料根为 `~/.dsh-uncensored`，配置了 `DSH_UNCENSORED_HOME` 时以实际路径为准。
2. 保留升级前的安装器和完整资料副本。在另一个目录进行演练。旧 profile 中的插件和锁文件也属于样本，先删掉它们会掩盖问题。
3. 在 macOS arm64 先走保留资料升级，再走全新资料启动作为对照。检查启动日志中实际解析的 Host 包、工作区列表、能否打开旧会话并在新会话中工作。记录安装包、版本、错误信息与结果。对外共享日志前移除凭据和私人会话内容。
4. 安装后若发生已知资料只读失败、记录数量异常或工作区无法载入，保留失败副本与日志。用升级前安装器搭配升级前资料副本恢复。已经迁移过的 SQLite 文件不能交给旧版直接写入。
5. 仓库内的跨版本验证使用两个正式标签各自写出的受控样本。把旧版 checkout、新还原的候选及可选的 Electron 可执行文件传给验证器。它先校验两个源码目录，创建一次性资料，复制后运行新端，在独立进程中重新打开，并比较原副本的 SHA-256。阶段失败时脚本打印保留目录。

```sh
git fetch origin tag v2026.11.24.3
git worktree add --detach .artifacts/review-old 7eaeddc6050ee60e114cc3ef0d81de9c1371aacd
cd .artifacts/review-old
pnpm install --frozen-lockfile
cd ../..
node scripts/verify-kernel-released-data.mjs .artifacts/review-old .artifacts/review-alpha
```

复验 `v2026.11.23.0` 时，将 fetch 的标签换成该版本，并用 `95325688c9134480b7289341ed4eda26e40a55d0` 创建另一个旧端工作树。候选复用[已还原和构建的目录](#固定内核候选)。若提示树不匹配，先核对旧端提交、候选上游提交和候选暂存树。

在命令末尾追加已核实版本和摘要的 Electron 可执行文件路径，可用 Electron 内置 Node 完成两次候选资料读取。Windows 和 macOS 还会执行一次桌面启动。Windows x64 已用 Electron `44.11.5` 验证候选树 `01f2be7ff2096aaa1606250f882aedc08c171258`。测试提供模拟的操作系统用户目录，启动 Host 时清除 `DSH_HOME` 和 `DSH_UNCENSORED_HOME`。各阶段操作及失败判据如下。[资料用例](../../kernel/0.2.3-alpha.2/verification/released-data.spec.ts.in) · [桌面 Host 用例](../../kernel/0.2.3-alpha.2/verification/released-desktop.spec.ts.in)

| 阶段 | 可以直接核对的结果 |
| --- | --- |
| 旧版写入 | 旧版创建两个工作区、两条有原文的写作会话和桌面 profile。profile 声明一个陈旧的工作区控制器，以及一个依赖该控制器的测试插件。陈旧副本一旦被载入就会抛错。 |
| 独立读取与重开 | 候选从副本读出工作区顺序、会话归属、置顶、归档、记忆和额度。修改副本后另启进程，复核记忆修订号和取消归档结果。 |
| 桌面启动 | 桌面项目管理器准备旧 profile，Electron 子进程启动已构建的 Host。用主进程分配的凭据读取首页。第三方插件须通过自己的 HTTP 路由确认它和 Host 看到了同一个工作区服务。 |
| 用户操作 | 通过客户端使用的 API 打开旧工作区，核对工作区 ID 和会话顺序，分别读回两条会话的原文，再创建一条具有独立标识的写作会话。Host 须确认正常退出。 |
| 资料保留 | 逐文件比较升级前备份的 SHA-256，并核对本次启动保留了 profile 中的两个插件及其文件。旧端写入和候选启动后分别核对官方目录 `~/.dsh` 的条目列表和标记文件内容。异常时保留复验目录和原副本。 |

候选桌面沿用已安装 DSHU 的资料目录。默认位置为 `~/.dsh-uncensored`，覆盖路径使用 `DSH_UNCENSORED_HOME`。已安装的 CLI 也接受指向独立目录的 `DSH_HOME`。继承的值恰为官方默认路径时会选用 DSHU 默认目录。对选定的目录，CLI 与桌面在准备 profile 前检查真实路径，拒绝官方目录本身、其子目录、包含它的父目录及指向它的目录链接。命令行查询版本仍可在资料目录不可用时执行。源码启动 `pnpm dsh` 和 `pnpm run dev:web` 同样采用专用目录。桌面开发启动默认使用工作区下的 `apps/desktop/.desktop-dev/home`，单独覆盖用 `DSH_DESKTOP_DEV_HOME`。桌面外部协议为 `dshu://open`。

本项覆盖 Windows 上的桌面 Host 和合成 profile。macOS arm64 的 DMG 覆盖安装、Gatekeeper 和系统更新器仍需在对应平台完成。

重点核对工作区标识、写作资料选择、滚动额度、会话事件和多代分叉。记忆要同时核对模型请求里的来源记录、资料库里的文本与修订号、禁用状态、作用域及总开关。账单里出现过提炼费用只证明历史事件能被计价，还需要证明确实能打开、检索和修改资料库。[记忆服务](../../packages/memory/memory/README.md) · [账单与迁移记录](2026-11-24-dsh-kernel-upgrade.md)

持久化检查另有一项已知缺口。历史 `target/admission` 事件的两个必填字段缺少兼容性声明。当前通用资料样本覆盖工作区、会话与记忆。持久化维护者须在旧资料副本上验证该类历史事件，登记读取决定，再运行目录与变更声明检查。见[已有会话兼容性缺口](2026-11-24-dsh-kernel-upgrade.md#已有会话兼容性缺口)。

主线另有一处持久化目录未同步。`pnpm run verify-persistence-changes` 在 `docs/persistence-schema.json` 报错。在上一节点 `f00eecb` 和本轮工作树中分别生成目录，所得 JSON 的 SHA-256 均为 `16fcf6843376da6b9a145d4d184c641fca699548c609888630406c80134391d7`。#25 的会话恢复使用既有事件，未变更 v4 日志格式。正式发行前逐项审查基线与已提交目录的差异，补齐对应兼容性声明，再生成目录并重跑此检查。

### 已安装的终端命令

两个正式版使用同一公开名称 `dsh-uncensored`。候选树 `bcf38a70caa09aef3b371ea8abec34e02e1dbee4` 也使用这个名称。Windows 菜单将包含 `dsh-uncensored.cmd` 的目录注册到当前用户的 PATH，并通过 `Software\DeepSeekHarnessUncensored\Command` 判断安装归属。macOS 菜单管理 `/usr/local/bin/dsh-uncensored`，修复和移除读取已发行版本的 `.dsh-uncensored-command.json`。本地 macOS 未签名打包配置使用 DSHU 的应用标识 `com.deepseek.dsh.uncensored`。

Windows x64 的实测使用 Electron `44.11.5`、构建后的桌面 Host 和带空格及中文的临时安装目录。运行 `dsh-uncensored --version` 得到日期版本 `2026.11.23.0`，与关于页左侧一致。内核仍为 `0.2.3-alpha.2`。运行 `dsh-uncensored --profile web --dump-config` 能读取包含记忆和余额的配置。两条命令均正常退出，测试用户的官方资料目录保留了原有条目和标记内容。这次测试使用单独准备的启动目录，正式安装器仍按下表验收。

在候选目录运行以下用例可复验菜单、启动器、Windows PATH 和卸载时的归属检查。Windows 用例在专用的临时注册表键上运行。275 项在 Windows 通过，另有 18 项受平台条件限制。macOS 的公开链接和终端参数转发还需在 macOS 上执行同一组用例，并用实际应用包复核。

同一树的构建 10 项和文档检查 43 项均已通过。构建环境与 CLI 参数另有 71 项通过。编译后的 CLI 在 Windows 验证了公开入口别名和版本查询。中英文 Chromium 用例分别核对桌面与窄屏的两种版本标识。 对两个正式版重新运行上节的升级用例，每版的 27 个样本文件均通过 SHA-256 核对。

```sh
pnpm exec vitest run --maxWorkers=2 apps/desktop/tests/cli-launcher.spec.ts apps/desktop/tests/command-path.spec.ts apps/desktop/tests/command-management.spec.ts apps/desktop/tests/command-installation.spec.ts apps/desktop/tests/runtime-preparation.spec.ts apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts
```

### Windows 安装器与版本身份

本表的 Windows 安装包由[安装器源码提交](https://github.com/Water-Run/deepseek-harness-uncensored/commit/2ddcf2394f273a5aa8d1d8385a8a9d525cbbe9c8)还原并构建。关于页记录应用源码树 `107a386c789706f8571e2916b103cdd4c77af80e`。补齐打包 README 的双语段落摘要后，文档节点的树为 `63c6ea861b584ea39a6caf4cce77c8255150b5a1`。当前候选的版本检查与安装结果见下方 [Issue 24](#issue-24-的首发版静默升级)。复现安装包的源码身份时，从链接的提交运行还原脚本。

Windows x64 的 Visual Studio C++ 构建环境使用下列入口。日历版本来自候选 `apps/cli/package.json` 的 `dshuVersion`。本轮候选 `2026.11.25.0` 对应 Electron 更新器比较的 `2026.1125.0`。关于页的右栏和包内的 DSH 运行时保留 `0.2.3-alpha.2`。安装应用标识使用 `com.deepseek.dsh.uncensored`。

```sh
pnpm --dir apps/desktop run check:package win-x64 --unsigned
pnpm --dir apps/desktop run package:win:x64:unsigned
```

本轮离线安装验收使用 `DSH_PACKAGING_PRESET=test`，`DSH_PACKAGING_CONFIG_DIR` 指向隔离目录，其中 `presets/test.env` 如下。Windows 与 macOS 的模板都填写 DSHU 应用标识。打包入口会报告误填的官方 DSH 标识。测试所用域名为占位值，线上更新与登录需另用相应环境验收。

```dotenv
DSH_DESKTOP_APP_ID=com.deepseek.dsh.uncensored
DSH_DESKTOP_AUTO_UPDATE_ENV=test
DSH_DESKTOP_NPM_REGISTRY=https://registry.npmjs.org
DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN=https://policy.invalid
DSH_DESKTOP_MANDATORY_UPDATE_CONFIG={"allowedAuthOrigins":["https://auth.invalid"]}
DSH_DESKTOP_WINDOWS_PACK_CONCURRENCY=4
```

配置本机 preset 的字段和外部依赖见还原后候选目录中的 `apps/desktop/packaging/README.zh.md`。本地未签名验收从 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/` 取 EXE。构建记录在 `apps/desktop/.desktop-build/packaging-runs/`。同一份客户端编译记录保存 UTC 编译时间。打包复用该时间，逐项核对当前源码树、品牌和产物摘要。源码候选正在打包时，文档生成和会留下临时文件的检查应在另一工作树执行。

在独立的 Windows 测试账户中复验以下操作。测试样本只使用本机写作工作区。无需在线模型或用户凭据。

1. 从已发布的 `v2026.11.24.3` 下载 Windows x64 安装包，以 GitHub 附件公布的 SHA-256 校验。安装后记录当前用户“已安装的应用”中的 DSHU 版本、登记项与安装位置。
2. 启动已安装的桌面程序，让程序创建自己的 desktop profile。在新建的工作区中创建写作对话，设置一个能辨认的标题。正常关闭并重启，确认标题已写入磁盘。记录工作区 ID、会话 ID 和 profile 的 SHA-256。用独立的官方资料目录放置可核对的标记文件。
3. 在同一账户、同一安装位置运行候选安装器。核对 DSHU 卸载登记项仍为同一项，安装目录、程序文件版本、终端命令与关于页使用预期值。另读安装目录内的 `resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json` 检查内核版本。
4. 用安装后的桌面 Host 打开旧版写入的资料，逐项核对工作区、会话和标题。创建第二条写作对话，正常关闭，冷启动再读。比对原 profile 与官方标记文件的摘要。旧数据留存、安装器返回值和应用版本分别记录，一项失败即保留对应日志。

在测试账户中保留一份旧版随包的 `@deepseek-ai/dsh-api-workspace-controller` 也是本轮验收条件。先从旧应用的 `resources/app.asar/dsh/node_modules/@deepseek-ai/` 下读取该包，将完整目录复制到测试账户的 `.dsh-uncensored/profiles/desktop/node_modules/@deepseek-ai/` 中。Electron 的文件 API 能读取 ASAR 内的条目。记录相对路径、文件数、包版本及每个普通文件的 SHA-256。用旧 Host 冷启动读取一次，再覆盖安装并用新 Host 复查。这样既能复现旧插件留在用户目录里的情况，也能核对安装器和应用启动时是否改写了它。

在执行安装的同一测试账户中，可用下列 PowerShell 命令核对登记信息、可执行文件版本和 CLI。对安装器运行 `Get-FileHash -Algorithm SHA256`。主程序与安装器的文件属性应显示同一四段 DSHU 版本。安装资源根目录的 `LICENSE` 是 DSHU 的 GPL 许可，`LICENSES/DeepSeek-Harness/` 内另有上游 MIT 许可和第三方声明。

```powershell
$product = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
    Where-Object DisplayName -like 'DeepSeek Harness Uncensored*')
if ($product.Count -ne 1) { throw "找到 $($product.Count) 条 DSHU 安装记录" }
$product | Select-Object PSChildName, DisplayVersion, InstallLocation
$program = Get-Item (Join-Path $product[0].InstallLocation 'DeepSeek Harness Uncensored.exe')
$program.VersionInfo | Select-Object ProductVersion, FileVersion, CompanyName
& (Join-Path $product[0].InstallLocation 'resources\runtime\cli\bin\dsh-uncensored.cmd') --version
```

本轮在 Windows 11 x64（Windows Sandbox，build 26100）的离线测试账户中，使用 GitHub 正式版安装器直接覆盖升级到缺省与写作候选。旧版安装器的 SHA-256 为 `a84001b8ec3d64ae4452833d8fdd018857900a772be366488de2f219334b5b30`。

| 实物或操作 | 验收结果 |
| --- | --- |
| 候选安装器 | `deepseek-harness-uncensored-2026.11.25.0-win-x64-unsigned.exe`，325,244,022 字节，SHA-256 `ac80a1099ce11086d642bf0c0f64ecc2acdfa459dd361f44aed7eb093c144cc0`。本地未签名测试包。 |
| 增量映射 | 同名 `.exe.blockmap` 的 SHA-256 为 `fba6b8a241b5869b2616ddab17b79e0a9207f69cb0e844b06a9cead9d93d9b84`。 |
| 版本和安装归属 | 旧版 `2026.11.24.3` 与候选使用同一 HKCU 卸载项 `4bbab420-ba6b-5135-af15-70ac616e0cb2` 和同一安装目录。安装器、已安装主程序、CLI 与系统登记均为 `2026.11.25.0`。包内 Electron 应用版本 `2026.1125.0`，DSH 内核 `0.2.3-alpha.2`，Electron `44.11.5`。已从实装资源读取 GPL、上游 MIT 及第三方声明。 |
| 保留旧资料 | 旧版写入的工作区和写作会话均通过 ID 和标题核对。升级后创建第二条写作会话，新进程能读回两条标题。旧工作区控制器的 37 个原文件、desktop profile 配置及独立官方目录的标记文件均通过 SHA-256 核对。 |
| 桌面窗口 | 从安装后的程序跳过凭据设置，打开账号菜单中的关于页，看到 DSHU 日期版本、DSH 内核版本及本次源码树。 |
| 同版修复 | 移出已安装的主程序并保存其 SHA-256。两条安装登记不一致时，安装器返回 2，未接管其他目录。登记恢复一致后，运行同一 EXE 补回主程序，字节摘要与原件完全相同。冷启动仍能读取升级前后的两条写作会话。 |
| 保留资料卸载并重装 | 使用 `/KEEP_APP_DATA` 后主程序和卸载登记均已移除。重新安装后，从冷启动的桌面 Host 再次读取两个标题，逐项复核旧文件与官方标记。 |

Windows 同版修复的关键是目录归属。安装登记与卸载登记均由当前用户持有，主程序缺失时两条登记仍须指向同一安装目录。迁移到其他位置时，另一个目录必须为空。安装开始后出现其他文件时，安装器会停止，并保留原文件。

重复同版修复验收时，先在专用 Windows 测试账户写入资料，正常退出后将主程序移到安装目录外，保留原件及其摘要。在该账户中临时让两条登记指向不同目录，在第二个目录写入可校验的标记。安装器应返回 2，两个目录均须保持原状。恢复测试登记后再次运行同一安装器，核对主程序摘要、卸载登记和两条写作会话，再按上表检查保留资料重装。

隔离目录替换用例在候选的 `apps/desktop/scripts/smoke-installer-directories.ps1` 中。传入锁定版本的 `-Makensis` 和 `-SevenZip` 可检查 10 个场景，包括首次安装、覆盖、文件锁、取消、解压失败及目标目录在安装途中被占用。检查原生解压和失败报告时，另在一份还原的测试源码中，将打包生成的 `installer-ui/strings.nsh` 复制到 `apps/desktop/installer/strings.nsh`，并通过 `-FrameLibrary` 传入同一构建的 `window-frame.dll`。两种解压方式各自的 10 个场景均已在 Windows x64 运行。

安装包源码的 10 项构建检查、14 项安装器定向测试以及中英文关于页的桌面和窄屏检查均通过。候选文档检查首轮通过 42 项，随后更新打包 README 的中英文段落摘要，单独重跑余下的配对检查，1,409 组文档全部一致。

### Issue 24 的首发版静默升级

首发版 `2026.11.23.0` 与已发布的 `2026.11.24.3` 均取自 GitHub Release。Windows x64 离线沙盒使用独立账户，先以 `/S` 安装首发版，再分别使用 `--updated /S` 运行下表中的安装包。两次升级尝试之间保留原安装登记和文件。[Issue #24](https://github.com/Water-Run/deepseek-harness-uncensored/issues/24)

| 目标安装包 | 退出码 | 安装后结果 |
| --- | --- | --- |
| 正式版 `2026.11.24.3` | `2` | 安装路径和 `DisplayVersion` 未变，`app.asar` 的 SHA-256 与首发版相同。 |
| 缺省与写作未签名候选 `2026.11.25.0` | `0` | 在原路径完成更新，卸载登记与主程序均为 `2026.11.25.0`，`app.asar` 已替换。 |

在 `v2026.11.24.3`，产品版本库已测试当天序号 `0`。原生安装器的比较测试使用另一套实现，当时未覆盖以 `.0` 结尾的已安装日期版本，普通打包也未执行该比较测试。先前记录的 `2026.11.24.3 → 2026.11.25.0` 实装只能证明这一条升级路径。

主线修复覆盖 `YYYY.MM.DD.0` 登记值与三段内部版本之间的比较。复验时，将已发布版本的原生解析器与新回归用例一起编译，首发升级用例会报告期望 `0`、实际 `-1`。换回修复后的解析器，应通过 54 个原生比较用例。普通 Windows 安装器准备流程也会运行这些用例，失败即停止打包。

中英文测试安装器使用生产 NSIS 配置和独立测试载荷。在 Windows 沙盒中，两者均已用 `--updated /S` 将 `2026.11.23.0` 登记更新至 `2026.11.24.3`，且能区分降级与无效版本的静默失败记录。

宿主机的完整静默测试在卸载阶段有两次残留测试主程序，分别出现在英文和中文测试包。隔离账户的两种语言均完成了相同的卸载用例。宿主机残留原因仍待查，卸载验收保留此项。

新版内核采用独立的 Windows 安装器。上表中的未签名候选可以升级首发版，但在隔离账户内把已安装版本登记为 `9999.12.31.65535` 后，原候选仍以 `0` 退出并覆盖安装。本轮 Windows 安装包使用源码树 `262735f10a0e611a03a30d6e303466f37c47bea1`，已将版本检查接入交互和静默安装共用的初始化步骤，常规打包会编译并运行原生回归。打包时使用锁定的 Electron npm 包提供的 SHA-256 清单。在禁用下载的检查中，正确缓存可复用，截断样本会被拒绝。

[正式安装包升级检查脚本](../../kernel/0.2.3-alpha.2/verification/windows-installer-upgrade.ps1) 接受两个实际 EXE 及各自的预期 DSHU 版本。将脚本和两份 EXE 只读映射到新的 Windows Sandbox，执行以下命令。每个起始版本各用一个干净账户。脚本先升级真实安装，再在沙盒内模拟较高和无效的登记版本，检查退出码、失败日志与文件摘要，最后恢复候选版登记并复验同版安装。成功时输出两个安装包和已安装文件的 SHA-256。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows-installer-upgrade.ps1 -PreviousInstaller .\old.exe -PreviousVersion 2026.11.23.0 -CandidateInstaller .\candidate.exe -CandidateVersion 2026.11.25.0
```

修复后的缺省与写作候选仍使用 DSHU `2026.11.25.0`、DSH `0.2.3-alpha.2`。以摘要区分同版本测试包。新 EXE 共 325,249,251 字节，SHA-256 为 `bca91a0693308b81ba338d5077584620d4263db2a056c6f3967ae353eb9a1bc6`。以下两次复验分别使用独立的离线 Windows Sandbox 账户。

| GitHub 起始安装包 | 起始 EXE 的 SHA-256 | 静默升级 / 同版安装 | 较高版本 / 无效登记 |
| --- | --- | --- | --- |
| `2026.11.23.0` | `8f54226cc0e43943d4b60c9c5539ee57959d23eb070eee38c2de504f3be66f1a` | 0 / 0 | 2 / 2 |
| `2026.11.24.3` | `a84001b8ec3d64ae4452833d8fdd018857900a772be366488de2f219334b5b30` | 0 / 0 | 2 / 2 |

两条路径均在原目录完成升级，主程序和卸载登记均显示候选版本，升级后的 `app.asar` SHA-256 均为 `5728017122784009ff9b01584e2b1b22bd4b169ac961c86d468ae63058146326`。两种拒绝各自留下正确原因并保留原程序和数据包摘要。第三个账户从上一正式版升级，核对旧写作会话、工作区、profile、37 个缓存控制器文件及独立官方目录标记。补回缺失主程序、保留资料卸载并重装后，冷启动均能读回升级前后两条写作会话。

上述 `bca91a06…` 安装包的打包进程在 EXE 写完、生成差分索引期间中断。已用锁定版本的 electron-builder 重新生成索引，复算全部 15,471 个块并核对整包摘要。对应 `.blockmap` 的 SHA-256 为 `80ffcbeb743333ac9fa3926274081a5535ade3f13318f73c873060d5acaabeaa`。解包后的运行时通过 CLI、离线插件及文档转换冒烟测试。

**包含 #25 会话恢复的 Windows x64 候选。** 完整打包及打包后的冒烟测试均已通过。本地未签名 EXE 仍使用 DSHU `2026.11.25.0`、DSH `0.2.3-alpha.2`。核对以下摘要可确认安装的是这一份。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| Windows x64 EXE | 325,254,568 | `65f60ad0e3425d8fe87e6cf95269a6fe11b7a07bdf9a201e04fba38e22d03a71` |
| EXE 的 `.blockmap` | 337,947 | `4077ea3bd6c714461f6808afacccc7a5923f71c83ce16be23a84bed1be3f3a75` |
| 安装后的 `resources/app.asar` | 216,124,330 | `b3d611456fab1351aa6aa75d49eb452bf2b6810aaa11eae4b813fe621be42620` |

差分索引的 15,541 个块均已按 EXE 内容重算。安装后的资源包含源码树 `75172761e1fc84f0e748533c63a6d19104b08909`。两个新的离线 Windows Sandbox 账户分别从上表两份 GitHub 正式包升级至这份 EXE，升级与同版重装的退出码均为 0，降级及无效登记的退出码均为 2。两处安装的资源摘要相同，安装后的 Electron 44.11.5 都通过了[三种模式的同会话恢复检查](#issue-25-的工具声明与会话恢复)。旧写作会话、缓存控制器及卸载重装的数据保全演练使用的是上一个摘要为 `bca91a06…` 的安装包。

验证正式更新时，分别从首发版和上一正式版的原始安装登记开始，通过线上更新渠道下载同一签名候选。记录实际安装器摘要、退出码、原路径、更新前后登记版本及 `resources/app.asar` 摘要，并检查旧资料。上表的本地安装验收未覆盖线上下载和签名。

## 桌面与平台验收

| 目标 | 对照安装形式 | 本轮发行候选验收 |
| --- | --- | --- |
| Windows x64 | exe | 缺省与写作的未签名安装器、保留资料及冷启动结果见上表。四模式包、正式签名与真实在线更新仍待验收。 |
| Linux x64 | deb、rpm 分别验证 | 当前源码候选的 `apps/desktop/scripts/package-target.ts` 尚缺主线已有的 Linux 目标。接入打包入口后记录发行版、包管理器和桌面会话。两种包各自安装、启动、保留资料升级并读取历史会话。 |
| Linux arm64 | deb | 候选也须接入 arm64 打包目标。在匹配架构的系统安装，验证随包原生依赖、启动与已有资料。 |
| macOS arm64 | DMG 手动安装，按旧版实际更新索引验证应用内升级 | 记录签名、公证及 Gatekeeper 结果，再做 Issue #20 的保留资料场景。过渡版本的旧更新器仍可能下载 ZIP。 |

交回平台结果时，每个安装格式单列一行，附上操作系统及架构、原安装版本与候选版本、安装包摘要、首次启动结果、升级后的资料数量和恢复演练结果。若失败，记录首次失败的操作和原始错误，将仍可运行的旧版本与对应备份成对保留。

旧候选的目录包、Electron 运行时和 Windows 安装辅助程序已有独立证据。新发行候选需要按相同源码提交验证具体安装产物。每个目标记录版本、源码提交、候选树、Node/Electron 版本、安装文件名和 SHA-256，以及首次启动和保留资料升级结果。[桌面打包](../../apps/desktop/packaging/README.zh.md) · [Windows 签名](../../apps/desktop/windows-signing/README.md)

## 交付顺序与接手责任

| 里程碑 | 责任与验收 | 可以交接的证据 |
| --- | --- | --- |
| 内核与通用功能 | 固定候选已接入记忆、账户余额、额度设置与左侧导航。关于页、模式设置和桌面菜单已在源码候选接入。Windows 缺省与写作安装器已核对产品日期版本、内核版本和许可。其余平台须核对各自的实际产物。按正常 Web/桌面入口检验，不同账户和工作区分别使用测试资料。 | 可还原的补丁和树、冻结安装、构建、定向测试、页面实拍、旧资料复验结果。 |
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
