# Uncensored 开发交接

## 恢复工作前

用户已明确恢复开发，要求统一审查 Grok、Claude、DS 的交付并推送 `main`。三方均已停止编辑，Claude 剩余工作由 Codex 接手。**仍不打包、不安装、不发布。** 先读 [完整需求 TODO](TODO.md)、本文件、根 README，再核对 Git；编号不变，按实际证据打勾。所有节点使用中文提交并推送同一个 `main`。

最新决定：**新对话的默认模式固定为缺省，不能在设置中修改。** 开始前仍可手动选择当前对话的模式。下文旧节点中的“设为默认”已经被此决定替代，不要重新实现该入口。

## 三方整合审查（2026-10-24，当前节点）

- Grok 交付基线为 `62a20157f3`。修复额度误记辅助请求、冷恢复绕过 API 会话装配、先删暂停记录再恢复、关闭未等待恢复任务结束等问题；新的恢复流程只接管本应用持有的普通对话，保留原模式、工作区和旁问装配，通知落盘后才确认领取完成。真实 AgentLoop＋JSONL 测试覆盖跨重启续跑、用户停止、删除和失败重试。
- 输入建议修复空编辑器灰字、英文前导空格、完整问句被续写成回答、Tab 光标位置、输入法、取消/超时/卸载及偏好保存失败。辅助请求优先关闭推理，完整请求与终态可从 Session 日志重建；两套 SDK 补齐期望输出。真实 Web 验证过灰色建议与 Tab 填入、不发送，4 次建议约 0.4–0.9 秒；完整三输入场景与独立成本仍待验收。
- 余额修复非法金额占位崩溃、负数解析、减少动态效果中途切换及长历史丢失峰谷。调休周末按官方价格说明计为低峰，纠正原实现。更新检查改用 semver、校验真实来源与分页、区分空发布列表、支持超时重试；桌面不再依赖已弃用的 getFeedURL。
- Claude 的默认项与控件样式一并接手：完全展开、下次输入收起、详细用量；日出日落四卡片已在真实设置页核对。修复模式/主题旧动画回调覆盖新状态、卸载后重新写入样式的竞态。未更新桌面安装资源或官方 DSH 数据。
- DS 交付的记忆、代理、模式资料、首次网安确认先完成编译接缝检查：补源码映射、Client 安全类型导入、统一事件声明与严格测试类型。实际启动进一步发现 `memory/remove` 与 Remote Service 保留方法冲突，导致接口装配整体撤回；改为 `memory/deleteRecord`，客户端同步。补齐漏装配的 `modeDossiers` namespace，并新增真实 Gateway 装配回归测试。
- 最终装配修复后完整构建 9/9 通过；三个聚焦批次分别为核心 116 项、界面默认项与输入 249 项、DS 接缝整合 176 项，均通过。依赖声明、改动文件 lint、README 文档门通过。详细日志在本机 `.dsh-build/grok-review/`，不提交含测试账号信息的截图或运行数据。
- 真实 Web 验证：空输入建议可见；随问直接内容→单次回答；旁问读取主线原主题及下一回合的新主题，关闭重开保留历史；网安首次确认倒计时结束后，未输入声明仍禁用确认，取消后保持缺省。保护开启分支和实际执行隔离仍未交付。
- 390px 实测发现设置页固定左栏把正文挤成竖排，已改为顶部横向导航，并复核深色设置及额度图表没有横向挤压。截图 `screenshots/settings-narrow-final.png`；宽屏深色外观为 `screenshots/settings-dark-final.png`。已恢复浏览器视口。余额悬浮层全部边缘组合、窄屏旁问、桌面与并存验收仍需继续。

### 持久化与接口兼容确认

- 额度 SQLite 从 v1 单调升级到 v2，保留费用和限额；旧暂停来源无法可靠分类，迁移后仅手动恢复，不能用旧构建回读。新暂停记录包含需求、所有者和领取信息，进程退出/失败保留，通知以稳定 pauseId 去重。
- Session 仍为 v4，未修改任何已提交的历史格式代际。`input/prediction` 增加可选 requestId/request/outcome/usage；恢复消息增加可选 pauseId；`input-prediction` 来源表示辅助请求提示而非用户手输。新读者接受旧记录缺失的可选字段；这不承诺旧构建能够解释新增事件。
- 本轮同步当前 `docs/persistence-schema.json`。历史声明门目前因旧公开文档删除后留下的 16 份无关联 schema 快照而失败，已保留原文件并记录到 `17.06`；不为过门禁重建整个公开网站，也不将该门报告为通过。
- 尚未发布的记忆 Remote 删除入口从 `memory/remove` 改为 `memory/deleteRecord`，所有当前客户端一并更新；磁盘记忆记录不变。自定义客户端需同步改调用名。

后续优先核对编号 `03.07`、`03.13`、`06.08`、`08.07`、`10.02–10.05`、`13.03`、`17.03`。目标保护 `09` 仍未接入，不能把责任确认或代理说成强制隔离。

## 本次暂停收尾（2026-10-24）

- 移除设置中的“设为默认”；后端忽略旧 `selectedDefault`，新对话使用发行配置中的 `standard`，显式选择当前模式仍可用。旧配置无需手动清理，已有会话不迁移模式。
- 未完成的生产目标保护代码已从运行时撤出，保存到 [暂停归档](pending/README.md)，包含补丁、完整文件和校验清单。最后的 SSH/文件系统改动未验证，不得描述为已交付。
- 默认选择及界面相关 70 项测试通过，日志 `.dsh-build/pause-default-tests.log`。
- 用户已撤销本次打包要求，打包进程已结束，不再继续，也不交付旧产物。已发现的后续问题记入 TODO：Windows 安装器缺 Visual Studio C++ 工具；`prepare-dsh.ts` 仍强制 Electron 产品版本与 DSH 引擎版本相同，阻塞独立版本打包。
- 首次打包完整构建 9 项通过，随后发现编译时间被重新生成，导致发行校验失败。已让发行校验采用产物记录中的编译时间，仍校验当前源码/产品元数据及文件摘要；时间格式必须为 ISO UTC。相关 48 项测试通过（`.dsh-build/pause-packaging-tests.log`）。
- 修复后完整构建再次 9 项通过（`.dsh-build/pause-package-retry.log`）；公开文档 2 项测试、文档配对、UI 国际化和提交 lint 通过。实际桌面打包未成功，不应将构建通过描述为可安装。
- 总目标仍未完成，剩余需求继续以下清单；暂停时不要创建自动恢复任务。

远端两个没有开放 PR 的 Dependabot 遗留分支已删除，本地与远端只保留 `main`。提交点已保存在本机 `.dsh-build/retired-branches.json`，对象已 fetch。没有修改官方 DSH 的安装与用户数据。

## 网安首次进入确认节点（2026-10-24）

- 该节点实现 `05.05`—`05.07` 的确认流程，不实现 `09` 的目标保护执行器，也不改变已有会话的临时切换规则、armor 文本、工具名单或模型配置。
- Host 策略位于 `@deepseek-ai/dsh-agent-preset-registry` 的 `src/security-entry.ts`，与 `switch-policy.ts` 分开保存状态。`select` 在空白新主对话进入 `securityEntryPreset` 前要求本次 Host 启动的确认；显式 `session.create` 也通过 `assertNewConversationPreset` 拒绝旁路。已有对话和非 GUI 组合保持原行为。
- 挑战绑定所有者、注册表生命周期、目标会话和保护修订号；10 秒单调计时、5 分钟有效期、一次性消费、声明逐字校验和保护变更失效均由后端执行。确认只保存在 Host 内存，页面刷新保留，Host 重启清除。
- `securityProtection` 是可选运行状态提供方；`securityEntryState()` 读取 `read()` 的 state/revision/capabilities，提供方变化时发出 `security-protection/changed`。当前 Web 产品没有提供方，因此显示 `unavailable` 并按未启用分支要求声明；保护开启分支仅由测试提供方验证，真实后端仍属 `09`。
- 客户端 `security-entry-controller.ts` 在座位暂存前拦截，确认前不改变模式强调色、标签或模式选择；取消保留原模式和草稿。`SecurityEntryDialog.tsx` 展示真实状态、倒计时、声明输入、处理中、错误与重试，设置入口跳到模式设置页。
- 通知通过 `agent-preset/security-entry` 转发，其他窗口同步；重复确认的挑战返回 `security-entry/consumed`，客户端重新读取后按已确认处理。断线、过期、保护变化和请求失败均可重试；卸载时清理计时器并释放等待选择。
- 验证：Host 策略/注册表/真实 Loader 组合相关 84 项通过；客户端 256 项通过，含 40 项确认控制器、12 项对话框、9 项座位门禁和 65 项 apply 装配。`security-entry.ts`、`security-entry-controller.ts`、`SecurityEntryDialog.tsx`、`seat-store.ts` 聚焦覆盖 100%。Typert 生成、中英配对和改动文件 lint 通过。
- 缺口：实际浏览器验收被并行任务尚未完成的 `ui-mode-materials`、`ui-settings-memory` 组合阻塞；曾观察到真实 GUI 后端以 `security-entry/required` 拒绝未确认的网安选择，但未完成完整倒计时/输入/取消/错误截图。完整 Client 构建仍受既有 `SessionStore` API 漂移（`17.06`）阻塞，本节点不宣称构建全绿。并行工作区包含其他任务暂存的改动，本节点提交仅包含本功能文件。

## 原始需求来源

- 必须按最初需求和截图审查 DeepSeek 的全部修改，不能只修最近截图。
- 本机 `.dsh-build/original-user-messages.json` 保存从原始 DSH 会话恢复的 32 条用户消息及图片引用；原始会话位置记录在 `.dsh-build/current-work.json`。
- 原 HANDOFF 可用 `git show 2dcdbd87:HANDOFF.md` 恢复阅读；不要重新公开旧文档站。
- 后续用户消息修改了若干早期决定，以下记录以最新决定为准。

## 已交付基础

- 独立 Uncensored v0.1.0，DSH 引擎版本仍为 0.2.1-rc.2；版本号解耦。
- 默认数据目录 `.dsh-uncensored`、CLI `dsh-uncensored`、深链 `dshu://open`、独立应用名及 Windows app ID。
- 黑底白鲸 SVG/PNG/ICO、网站图标与托盘资源已生成。**实际安装的桌面程序与快捷方式仍需更新验收。**
- 首页使用“更自由的探索未至之境”，不再显示预览版或去审查版徽标。
- 根 README 已重写为简洁中文文档，旧公共 docs/website 已移除；工程内部文档和残留链接仍需清理。软件保留中英双语，用户撤回了中文单语要求。
- 根发行采用 GPL-3.0-or-later，保留上游 MIT 通知。集成发行的完整依赖许可审计尚待完成。
- 关于已包含独立版本、DSH 版本、源码提交与时间、purge fork 提交与时间、编译时间、许可及仓库入口；布局和更新状态尚待重做。
- 模式顺序为缺省（蓝）→ 网安（红）→ 逆向（绿）→ 写作（黄），有不同图标与配色。已有对话默认锁定，新对话可以选择；已有对话切换已改为后端计时十秒后确认，仅本次 Host 启动有效，重启关闭。
- 会话左边已有模式色条，失败、新会话、未知模式为灰色。
- `/side` 与 `/btw` 已作为内置功能实现。`/side` 与“开始”共用右栏标签区，“开始”有入口，关闭重开保留旁问；`/btw 问题内容` 已改为新上下文单次问答，结果块无追问输入区。
- 支持不绑定工作区的新会话；忙碌时 Enter 默认插话；模型菜单集中显示 Flash，保留旧会话模型解析。

## 当前开发节点

### 额度门闸

- 新包 `packages/guard/spend-limit`，由 base bundle 内置加载，不依赖余额采样开关。
- 默认关闭，自动恢复默认关闭。六档滚动限额：15 分钟 5 元、1 小时 15 元、5 小时 50 元、1 天 100 元、7 天 500 元、30 天 2000 元。
- SQLite 事务在请求前持久预留额度；不同会话、不同本机进程不能重复占用同一余额。配置与统计由同一账本保存。
- 覆盖 LLM 请求、重试、标题、压缩以及单独发起模型请求的 DeepSeek 原生搜索。
- 完整成功用量按公开高峰费率估算；未知最终用量保留预留额，死进程遗留请求保守计入。原始提示词和模型请求不被改写。
- 额度不足时原请求等待；启用自动恢复后，额度释放会继续该请求。关闭自动恢复时，已结算费用造成的额度不足会保持暂停，直到手动恢复、重置或禁用。仅由在途预留造成的等待会随结算继续。
- 用户明确要求“自动恢复”意味着被暂停的对话继续执行。当前覆盖本进程仍在等待的原请求；跨重启恢复、明确的会话暂停状态及真实 AgentLoop 恢复验收仍应补强，不要把只更新数字称为完成恢复。
- 重置已完成统计不会清除在途预留。单次预留本身超过上限时直接拒绝，并提示调低输出上限或提高额度。
- 界面有六档进度条、开关、限额编辑、暂停提示、恢复和重置；已与余额、统计和账单入口统一放入“额度”分组。
- 估算不是账单：默认按整个配置上下文容量和最大输出保守预留，可能较早等待；不含应用外请求或其他付费工具；未配置费率的模型在限制开启时被拒绝。
- 初始化失败保留拦截入口，不会因账本损坏而静默放行。还应补充损坏账本的真实组合启动测试。

### 旁问同步主线

- 每次旁问请求组装上下文时读取主线新完成的回合，排除尚未完成的回合和队列消息。
- 旁问保留自己的历史，不写回主线。上下文通过现有机制记录到旁问 Session 日志。
- 新增 `sideContextBytes` 配置，默认 65536 字节，包含完整包裹文字；过长时保留最近内容并标注省略，不切断 UTF-8 字符。
- 已验证主线新增内容进入下一次旁问、旁问旧内容仍在、主线不被修改及关闭重开复用身份。

### 余额界面修复

- 文案改为“高峰时段”“低峰时段”，删除“梁文峰”“梁文谷”等表述。
- 赠金为 0 时隐藏侧栏和详情里的赠金项。
- 修复悬浮卡内容固定宽度超过容器的问题，改用支持视口约束与滚动的已有 HoverCard 样式；图表和统计列可收缩、换行。
- 修复未定义的背景变量，额度卡在合适宽度下采用双列。
- 悬浮卡仍需完成浅色、窄窗口、屏幕边缘的最终浏览器复核；本轮截图已验证零赠金隐藏，尚未取得展开悬浮卡的最终截图。

## 最新 UI 与交互要求（待实现）

### 设置结构（五分组与插件迁移已完成）

严格按 **通用 → 模型 → 额度 → 模式 → 插件** 排列。

- 通用：外观、语言、工作步骤、性能等通用行为。
- 模型：模型配置，以及登录和账号管理。
- 额度：余额、历史统计、刷新设置、额度限制、恢复与重置。
- 模式：选择当前模式，新对话默认固定缺省。当前模式专属功能（境内网站保护、生产/测试目标、代理、写作资料等）仍待实现并接入此分组。
- 插件：完整迁入插件安装、启用、配置、内置和实验性功能。移除左栏独立“插件”入口。

### 外观与动画

- 外观用用户提供的预览卡片样式：日出日落、跟随系统、浅色、深色；默认日出日落。
- 自动检测时区。时区不能给出精确位置，已向用户说明按代表城市估算日出日落并提供手动城市选项；实现时不要把估算写成精确定位结果。
- 四模式必须影响整个应用的主题强调色，包括 1017 徽标、发送按钮、选择状态等；不要只改顶部文字。
- 模式切换要有明显、完整且有冲击感的颜色扩散、图标和色条动画；灰色变为模式色时也需要过渡。
- 模式卡片/标签去掉“模式”后缀。浅色界面下网安卡片使用深红底、有质感的边框和更粗白字；其余模式依相应颜色设计，并核查深浅主题对比。
- 全面修复原版 DSH 缺乏动画和样式粗糙的问题，包含按钮、开关、弹窗、菜单、标签页、面板、输入框、悬浮卡和溢出；遵循减少动态效果设置。
- 文案保持严肃、简洁，不用谐音梗、夸张能力宣传或开发过程术语。
- 余额默认刷新率 **15 秒**、点击立即刷新已实现；已有手动保存的刷新间隔继续保留。金额变化的数字滚动效果尚待实现。
- 关于页重做 DSHU Logo、GitHub Logo/入口、当前版本是否最新、构建信息和日期展示。不能把更新检查失败显示为“已是最新”。

### 默认项与确认

- 工作步骤默认“完全展开”，收起时机为“下次有新消息时”。
- 性能与用量默认“详细”。用户最新截图还显示“使用官方模型 API 时上传 Session Log”为开启，已向用户按开启记录；目前代码默认关闭，后续按最新确认落实，注意这是对早期默认决定的变更。本轮没有替用户上传真实日志。
- “允许已有会话切换模式”已移到模式分组；默认关闭，启用有 **10 秒倒计时警告和确认**，后端同步校验；软件重启自动恢复关闭。新对话选择模式不受此开关限制。
- 每次启动后，**只对新对话首次选择网安**给出责任及保护能力提示；重开已有网安对话不提示。
- 境内网站保护开启：10 秒倒计时确认。保护关闭：仍需倒计时，并额外手动输入“我确认……”责任声明。
- 首次确认之后不要反复加确认、缩减工具或修改提示词，保护只按用户明确配置的目标和等级执行。

### 随问（已实现）与输入预测（待实现）

- `/btw` 中文统一为 **随问**。
- 仅接受 `/btw 问题内容`，直接发出一个全新上下文的问题，主对话内显示简单结果小块。
- 单独 `/btw` 不创建空窗口。结果块没有追问输入框；每次调用独立。
- `/side` 持续跟进主线已完成内容，保持独立的可持续对话。
- 增加可开关的输入预测：灰色预填充，Tab 接受，不自动发送；覆盖主输入、`/side`、`/btw`，分别预测各自场景的内容。
- 用户举例随问更可能是“进度如何”之类简短问题。预测可以参考交互状态，但不要擅自改变随问回答的全新上下文语义；实现时需把这两层区分清楚。
- 预测请求计入额度。默认开关、预测模型、触发节流尚未确定，恢复后自行做合理决策并验证实际费用和延迟。

随问实现通过内置命令的文本参数提交，菜单选择只进入问题输入状态；空内容不创建子会话。提交失败保留原输入，同一问题的并发提交会合并。关闭时保留在途提交所需的引用直到完成，未提交的问题关闭后不会发送。结果区隐藏普通输入、分支、反馈和用量操作，仍允许必要的工具授权交互。旁问仍提供完整对话界面。

## 尚未完成的核心能力

- **生产保护门闸**：生产/测试服务器和数据库可选标记；生产分完全保护、允许安全审计；测试目标允许充分测试。必须在执行路径中拦截并验证拒绝没有副作用，不能只靠提示词。
- **境内域名保护**：默认启用；支持手动域名、正则规则。与生产标记、代理及工具执行统一校验。
- **网安专供代理**：独立代理与请求/响应流量查看；隔离应用控制面和模型 API；关闭独立代理时的警告开关默认关闭。
- **网安和逆向特化**：保持完整工具和原有提示词装配，强化目标管理、审计/分析工作流与专属定制功能。不能声称可保证模型始终不拒答。
- **逆向**：参考 GitHub REA 等成熟项目，核查许可、版本和实际工具接入。当前主要为模式提示词/图标框架，专用后端未完成。
- **写作**：自然文字表达、参考文风、设定集、人物、连续性和文学工具，不只是普通提示词。
- **跨会话记忆**：结构化、可管理、可检索；不是简单把旧聊天全部塞入上下文。
- **更新检测**：GitHub Release 补丁提醒、次版本启动弹窗、主版本强化提醒；清理遗留 COS 自动版本发现和发布脚本，版本与官方完全解耦。
- **安装与隔离**：实际更新 Uncensored 桌面安装、快捷方式、图标并验证官方版并存；修复 home-paths 仍接受非默认旧 `DSH_HOME` 的问题。
- **开发热更新**：完整重建时曾出现空白页、`syncInspectManifest` 不存在、连接/Session 引用释放错误；刷新可恢复，根因仍未修复。
- **历史模式恢复**：已恢复隐藏的 PTC、Minimal 定义及原工具组成，不改写或冒充四个主模式。真实 `code`→`ptc` 相邻代际恢复和原生持久终端、图片读取已通过；旧 POSIX Bash 录制场景保留原权限配置，Windows 使用新增原生工具场景。POSIX 浏览器金样仍需在对应平台验证。
- **文档与许可**：根 README 最终按简短介绍→通用增强→模式特化→使用/版本/Credit 排列；保留 DSH、YuJunZhiXue、小杨、JeffKeeping、Water-Run 与图标许可 Credit；完成生产依赖许可核查和删除文档的残留链接清理。
- **原始验收**：最后重新核对原始 32 条消息、全部新增消息与截图；还有不少上述能力未完成，不得提前将总目标标记完成。

## 提示词和许可证核验

原有中英文 armor 文本已与 MIT 历史提交 `e1d8e59087857fa86d0ef2bb9878800274b13a29` 比较一致。当前 purge 分支包含专有许可，不能把其新内容直接纳入 GPL 发行。`product.json` 所记录的 fork 参考提交与可复用内容的历史许可应分别说明。

核验脚本 `.dsh-build/verify-purge-source.mjs` 显式传上述 MIT 提交，输出 `.dsh-build/purge-source-verification.json`。不打印完整提示词或私密凭证。新模式增强不得意外改写这部分文本。

## 额度节点验证与后续验收缺口

- 相关测试：80 文件，1482 通过、1 跳过，日志 `.dsh-build/spending-side-suite-final.log`。
- 新增门闸与旁问聚焦测试：26 通过，含独立子进程竞争预留、真实 Loader 组合、生命周期、上下文同步及 UTF-8 长度限制。
- 构建的 7 项产物门通过；最初聚合检查发现测试缺 `surfaceOp`，已修正；随后 `pnpm run build:check` 两项全通过，日志 `.dsh-build/spending-side-check-final.log`。
- `verify-package-dependencies`、`verify-export-jsdoc`、`verify-client-ui-i18n`、`doc-sync` 已通过。
- 真实浏览器：低额度请求被拒绝并显示 `SPEND_REQUEST_TOO_LARGE`，账本没有预留/收费；测试环境已恢复六档默认值，限制及自动恢复均关闭。
- 浏览器确认零赠金隐藏与严肃文案；截图 `.dsh-build/screenshots/spending-settings-final.png`。完整浅色/窄屏悬浮卡、/side 真实模型持续跟进、自动恢复的真实会话演示仍需补齐。
- 本节点有真实 Session/AgentLoop 行为测试和上下文文字快照；完整新增功能的顶层 keyless recorded-session 场景尚需补充。不要把整套快照回归描述为通过。
- 上一节点已有 87 项 Client domain graph 报错，经与 2dcdbd87 对比全部为既有项；未关闭检查。完整 hygiene 最近聚合不是全绿，细节在本机 current-work 文件。

## 删除对话（2026-10-24 已实现）

- 会话列表的右键/更多菜单增加“删除对话”，删除前显示会话名称并确认。
- 运行中的对话先停止，再删除；后端校验权限并清理会话存储、列表索引及关联旁问/随问引用，不删除工作区文件。
- 删除当前对话后切换到相邻对话或新会话；失败时显示可重试提示。
- 验收：重启后不再出现已删除对话，无残留标签或失效引用，其他对话与工作区文件保持完整。

删除入口位于会话行菜单，弹窗独立于会话行存活；确认期间禁用重复提交和关闭，失败可重试。后端停止任务，等待子任务和后台活动退出，释放 API 实际持有的 AgentHandle，再取得全部写入锁。原生旁问、随问与所属子任务一并清理，独立分支、其他对话和工作区文件保留。外部持有写入权或权限不足时拒绝操作。

JSONL 将已删除目录移入私有清理区，保留仅含标识的删除记录；重启继续物理清理和搜索/投影/工作区引用清理。已删除标识不可复用。原生子会话发布和删除共用跨进程目录互斥，避免另一实例在父对话删除期间创建孤立旁问。客户端忽略删除后的迟到列表、投影和状态，关闭对应旁问标签，并转移当前选中项。

验证：完整构建 9 项通过（`.dsh-build/delete-build-verified.log`）；聚焦加固 114 项通过，受影响大组 96 文件中 2662 通过、11 跳过、12 失败，12 项均为不支持删除的存储替身被恢复清理错误调用，已修复，相关 6 文件 91 项全部通过（`.dsh-build/delete-repair-tests.log`）。真实 JSONL/SQLite 集成测试覆盖运行中停止、权限拒绝、外部写入权、全部目标写锁预检、冷索引即时删除、重启清理和两个 Host 的旁问创建竞争。浏览器验证菜单、确认、取消与保留会话；截图 `.dsh-build/screenshots/delete-conversation-confirmation.png`，浏览器未执行永久删除现有数据，执行路径由集成与组装 UI 测试覆盖。

公开 README 和相关包说明已更新；依赖、导出 JSDoc、UI 国际化及公开文档检查通过。最后一轮修改后，7 文件 126 项聚焦测试通过（`.dsh-build/delete-checked-tests.log`），完整构建 9 项再次通过（`.dsh-build/delete-build-complete.log`），本节点全部改动 TypeScript 文件的 lint 通过（`.dsh-build/delete-lint-changed.log`）。全仓 lint 仍包含先前模式、额度和设置代码的既有报错，不能描述为全绿；日志 `.dsh-build/delete-lint-final.log`。完整新增功能的顶层 keyless recorded-session 场景仍在总验收缺口中；不要将整个项目或所有原始要求标记完成。

## 恢复后的设置节点（2026-10-24）

- 设置已按通用、模型、额度、模式、插件排列；登录与身份管理进入模型，账单/充值入口与余额/限额进入额度。
- 插件安装、启用、配置与实验性功能已迁入设置，左栏独立插件入口移除。其他功能的插件详情链接打开设置，保留当前会话。
- 设置支持直接定位到指定分组；程序化插件跳转会选择管理页。卸载时移除导航服务与监听。
- 设置面板加宽，额度内有余额/限额分页。完整视觉重做、模式选择与确认、日出日落及动画仍待继续。
- 余额默认 15 秒刷新，点击余额立即请求刷新；不覆盖用户已保存的间隔。
- 构建 9 项全通过（`.dsh-build/settings-node-build.log`）；相关聚焦测试 120 通过（`.dsh-build/settings-node-final-tests.log`）。此前大组 1143 项中 1127 项通过，旧入口断言已更新，受影响文件的后续回归通过；不要把那次大组运行说成全绿。
- 真实浏览器已验证五分组顺序、登录在模型组、额度分页、插件管理和插件配置打开。截图 `.dsh-build/screenshots/settings-plugins-migrated.png`。
- 随问单问单答已在下一节点实现；接下来补删除对话，再继续模式设置和整体主题。

## 继续时的建议顺序

随问节点补充验证：命令、界面和生命周期相关测试 351 项通过，Host/命令聚焦测试 158 项通过；真实页面已验证裸 `/btw` 无窗口且提示输入内容，`/btw 问题内容` 直接返回独立回答，结果块没有输入框、分支、反馈或用量按钮。截图 `.dsh-build/screenshots/btw-single-question.png`。关闭按钮的原生灰底也已清理。完整重建仍会触发旧的热更新空白页问题，刷新能恢复，该问题仍未关闭。

1. 阅读本交接，确认用户已明确恢复；核对 main 与工作区。
2. 删除对话、当前模式选择、默认项、已有会话切换的临时确认节点已完成；网安首次进入的责任提示仍需与实际防护状态一起实现。
3. 统一全应用主题色、主题预览卡、日出日落、模式动画、按钮/开关/悬浮卡、余额滚动及关于页；补 POSIX 浏览器金样验证。
4. 补真实执行保护、网安首次新对话确认、独立代理、模式特化与结构化记忆。
5. 补自动恢复和输入预测、更新检测、隔离、安装、许可和完整原始需求验收。

推送时保留所有钩子。Windows Git Bash 若找不到 pnpm，在当前 PowerShell 进程前置 `C:/Program Files/nodejs/node_modules/corepack/shims` 到 PATH，再正常推送，不绕过检查。不要提交 `.dsh-build` 中的认证 URL、用户会话、余额记录或截图。

## 模式设置节点（2026-10-24）

- 卡片选择当前对话的模式，独立按钮设置未来新对话的默认项；删除了默认设置同步改动当前空白会话的旧路径。模式切换开关已从通用迁入模式。
- 后端只接受所有者确认：十秒单调时钟计时、一次性确认标识、五分钟过期、禁用即撤销待确认标识。权限仅保存在注册表实例内；旧 `allowExistingSessionSwitch` 配置仍可解析但不再生效，修改旧文件不能绕过确认。已有对话运行期间仍禁止切换。
- 权限推送同步其他窗口；迟到的读取或确认响应不能覆盖更新的撤销。UI 倒计时不自动确认，取消保持关闭，关闭插件会清理计时器并等待在途请求。
- 四个主要模式的显示名已去掉“模式”后缀。选中卡片和会话标签使用深色模式底色、清晰边框和白色较粗文字；增加统一颜色变量，已验证浅色/深色对比。全应用 1017/发送等强调色、灰条到模式色的冲击动画仍未完成。
- 模式/注册表/事件相关 15 文件 248 项测试通过（`.dsh-build/modes-final-tests.log`）；完整构建及检查结果以 `.dsh-build/modes-build-complete.log` 为准。改动文件 lint、JSDoc、国际化、依赖和两组文档配对已通过。原有 Web 模式回放失败情况见上文，不能报告这组回放通过。
- 实际浏览器验证当前选择与默认项分离、十秒按钮禁用、取消不授权、通用页已无旧开关；截图 `modes-current-light.png`、`modes-current-dark.png`、`modes-switch-confirmation.png` 位于 `.dsh-build/screenshots/`。预览恢复默认缺省、当前缺省、跟随系统、临时授权关闭。390px 视口仍待实际浏览器验收；当前 IAB 未暴露视口调整能力。
- 首次新对话进入网安的责任确认尚未实现；目前真实境内/生产保护后端仍缺失，不能显示为已开启。本节点未修改 armor 提示词或模式工具组成。

## 历史模式恢复节点（2026-10-24）

- 从原始基线 `57086f121a` 恢复 PTC、Minimal 定义，保留原工具组成。定义可设 `hidden: true`，仅从公开选择列表隐藏，显式解析、恢复、挂载仍可使用；不是权限限制。四个主模式的选择顺序未变。
- 保留全部冻结 Session 日志及代际。`preset-migration.snapshot.ts` 继续检查父子关系、损坏日志拒绝、只发布当前后继版本，以及原始字节不变；新增事件的权限期望对应本发行当前完全权限默认值。
- 新增 `legacy-presets.e2e.ts` 通过真实 Web 配置检查四模式列表、隐藏模式挂载、原生 shell 持久环境/目录和图片读取；Windows 使用 PowerShell，POSIX 使用 Bash。修复 keyless scaffold 的路由适配器丢失图像能力元数据的问题。
- 原 `minimal-preset.snapshot.ts` 固定 Bash 命令和 Bash schema，已明确限于 POSIX；增加历史权限 overlay 保留这些录制的 workspace-write/ask 环境，不篡改冻结录制。Windows 本机的完整 Bash/UI 金样仍未验证，本机还缺 Playwright 1228 浏览器。不要报告整个 Web 快照套件通过。
- 补上额度模块在 `tsconfig.base.json` 的源码及 types 路径映射，`verify-cordis-config` 277 配置文件通过。新增 Web 原生测试已进入 Host 检查程序，并从 Client 项目排除。
- 验证：注册表/声明相关 60 通过、1 跳过（`.dsh-build/legacy-presets-tests.log`）；历史恢复与原生工具 3 项通过（`.dsh-build/legacy-presets-web-final.log`）；构建 9 项通过（`.dsh-build/legacy-presets-build-clean.log`），新增测试纳入后 Host/Client 聚合检查 2 项通过（`.dsh-build/legacy-presets-check.log`）；改动文件 lint、JSDoc、依赖、配置及文档配对通过。
- 一次新 Web 测试遗漏 Client 排除项导致编译生成 56 个未跟踪源码旁产物，已按工作区内路径及同名已跟踪源码逐一验证后清理；没有保留或提交这些产物。工作区应只包含节点源码与文档。
- 下一项优先补境内域名/生产服务器和数据库的真实执行门闸，再把网安首次新对话责任确认接到真实保护状态；不能仅在提示词中加规则。额度、代理、模式特化等原始需求继续按本交接推进。

## 三项模式特化节点（2026-10-24）

- 新增 `packages/skill/skill-playbooks`（GPL-3.0-or-later）：一个技能提供方，按预设 `packs` 挂载网安、逆向或写作手册。网安 7 份、逆向 8 份、写作 7 份技能，配套参考表与两个零依赖 Node 脚本；标准预设不挂载，写作预设仍无终端/命令执行工具。
- 真实存储与调用入口：`assets/shared/scripts/casefile.mjs` 在 `.security/<slug>/` 或 `.reverse/<slug>/` 维护 `case.json`（目标、证据、发现、备注），带锁、原子写入、严重级别校验和 Markdown 报告渲染；`sample.mjs` 流式计算哈希、格式、熵与字符串。两个脚本各有测试。
- 预设人设改为阶段化路由：网安按侦察/Web/网络/载荷/云/报告指向技能并保留既有"目标是用户的、占位符继续工作"要求；逆向按初筛/静态/动态/协议/补丁/移动/恶意样本/案件簿路由；写作保留原写作纪律并新增 `story/` 设定集与风格卡约定。armor 文本未改动。
- 开源调研与许可：`morluto/rea`（MIT）、`mrexodia/ida-pro-mcp`（MIT）、`LaurieWired/GhidraMCP`（Apache-2.0）、`swisskyrepo/PayloadsAllTheThings`（MIT）已核对；写作参考 `SillyTavern`（AGPL-3.0）与 `novelWriter`（GPL-3.0）仅作先例，未复制代码或文本。取舍与完整清单见 `.agents/notes/implemented/architecture/2026-10-24-mode-specialization-playbooks.md`。
- 验证：`playbooks.spec.ts` 13 项通过（含真实 `cordis.yml` 组合、注销、非法手册拒绝、账本与清点脚本、预设挂载与脚本路径断言）；`tsc -b packages/skill/skill-playbooks` 通过；`verify-cordis-config` 277 个配置通过；`verify-runtime-closure` 通过；`verify-default-product-isolation` 通过；新增文件 oxlint 通过；README 中英配对、包限制章节、Agent Note 格式与分类检查通过。
- `pnpm run build:artifacts`：Host 侧门禁通过；Client 编译器仍因既有 `SessionStore` API 漂移（`ui-chat`、`ui-goal`、`ui-model-selection` 等本次未改的文件）失败，Client bundle 与 Web build 随之跳过。属既有 `17.06` 债务，不由本节点引入；本轮另修掉 `spend-limit` 测试的 `brandString` 泛型错误以恢复 Host typecheck（提交 `1b12eadabb`）。
- 三个提交已推送 `main`：`cd21bb9f5b`（手册包与预设）、`1b12eadabb`（额度测试类型修复）、`63bb8d327b`（脚本相对路径修正）。本次未打包、未安装，运行中的桌面版仍是旧产物。
- 已知缺口：未用真实模型验证效果；模式设置页（`04.05`）与跨对话结构化记忆（`13`）仍未接入；全仓文档配对与子系统页面检查在本分支本来就有大量既有失败（`17.06`），本次没有扩大处理范围；本节点未打包、未安装。

## 跨对话记忆节点（2026-10-24）

- 新增 `packages/memory/memory`（GPL-3.0-or-later）：`ctx.memory` 服务打开 `memory` 存储域（单文档 `storages/memory.json`），记录含 ID、类型、内容、范围、来源、时间、版本与状态；检索为进程内中英文词项匹配（汉字单字与相邻双字），按相关性、范围具体度与新鲜度排序，去重、同主题冲突取最新、并按条数/字符/字节预算裁剪。注入作为 `memory-context` 用户消息写入 Session 日志，来源记录每条 ID 与版本；已注入记录不重复，随问等未继承历史的新建子会话不注入。模型工具 `memory_write`／`memory_search` 由 `./agent` 子路径按预设挂载。
- 新增 `packages/api/memory-controller`：`remote.memory` 命名空间，读取开放、写入要求所有者，版本冲突返回 `memory/conflict` 并携带两个版本。
- 新增 `packages/client/ui-settings-memory`：通用设置中的一行与模态管理面板（搜索、范围/类型筛选、新增、编辑、启停、删除、冲突保留输入）。五个设置分组的结构未改动。
- 存储采用单文档布局而非按记录布局：按记录布局会静默丢弃无法解析的文档，与“损坏时明确报错、不清空用户数据”的要求冲突。
- 验证：`packages/memory/memory/tests` 24 项通过（含中文检索、去重、冲突、预算、持久化重开、损坏存储、真实 AgentLoop 中工具保存→另一对话注入→日志重建→删除后不再注入）；`packages/client/ui-settings-memory/tests` 6 项通过；四个新包 `tsc -b` 通过；Typert 工件已生成（35 个包）。
- **未完成**：自动提炼（含独立开关与额度接线）、语义检索、来源会话失效标记、删除对话与保留记忆的界面说明；跨工作区目标分级仍依赖已归档的 `09`。
- **集成阻塞（重要）**：本次并行会话中另一模型同时修改了 `packages/bundle/base/cordis.patch.yml`、`packages/bundle/base/package.json`、`packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/web-app/package.json`、`packages/api/remotes/*`、`tsconfig.base.json`、`tsconfig.host.json`、`tsconfig.client.json`、`.agents/TODO.md`，加入 security-proxy、mode-dossiers 等尚未跟踪的包。记忆的记忆行（base）、memory-controller／ui-settings-memory 行（web-app）、四个预设的 `dsh-memory/agent` 行、`api/remotes` 挂载与三处 tsconfig 引用均已写入工作区，但上述文件同时含他人未提交改动，按“只提交本任务文件”的要求未纳入本次提交。合并时需与对方的这些包一起提交，或在对方提交后重新应用记忆相关行；`pnpm install` 当前因 `packages/shell/tool-bash` 引用未登记到工作区的 `@deepseek-ai/dsh-security-proxy` 而失败，pre-push 的 `pnpm run typecheck` 因此无法通过。

## 网安独立代理与流量查看节点（2026-10-24）

- 新增 `packages/guard/security-proxy`（`@deepseek-ai/dsh-security-proxy`，服务定义 `ctx.securityProxy`）与 `packages/guard/security-proxy-local`（`@deepseek-ai/dsh-security-proxy-local`，提供者，base 组合内置挂载），以及 `packages/client/ui-security-proxy`（设置 → 模式 → 网安资料区与流量查看器）。服务定义与提供者分离，消费者只依赖定义包。
- 覆盖判定读取会话日志中已提交的 `security` 预设（最近一次 `agent-preset/selected` 或会话头），工具参数不能自报模式；`standard`、`reverse`、`writing` 与模型 API、登录、余额、更新检查不经过该代理，插件从不安装进程级 dispatcher。并发会话按各自的回环监听隔离。
- 上游支持 `http`/`https`，密码经 `ctx.credentials` 保存为 `DSH_SECURITY_PROXY_PASSWORD`，设置文件、流量记录与错误文案不含明文；没有通过放宽 TLS 校验"解决"连接问题。连接检查真实发起 CONNECT；状态机为 `off`/`connecting`/`ready`/`failed`，失败带机器原因与不含凭据的详情。
- 受控客户端（`web_fetch`）在自身请求/响应层记录明文，TLS 仍为 Node 默认校验；子进程获得每会话回环链式代理的环境变量，明文 HTTP 完整捕获，CONNECT 只记录隧道元信息并标注 `tunnel-metadata-only`。记录默认脱敏 `Authorization`、`Cookie`、`Set-Cookie`、`Proxy-Authorization` 与常见 JSON/表单密钥字段；条数、正文字节、保留时长有上限，记录只在内存。
- "网安模式未开启独立代理时警告"默认关闭，每对话一次（销毁后重置），经 `security-proxy/warning` 事件在前端提示，不改变代理状态。
- 验证：新增 59 项测试通过（`capture` 15、`settings` 12、`engine` 15（含真实本机上游代理、目标服务器、CONNECT 隧道、超时、取消、断连、正文截断、关闭后端口不再服务）、`composition` 6（真实 Loader + 真实凭据提供者 + 归属拒绝 + 提醒去重 + 凭据只在凭据库 + 重启保留与失败状态）、客户端 11）。改动文件 lint 通过；`verify-client-packages` 通过；新包的 README 中英配对已记录。
- 提交：`eb54dd4574`（服务定义与提供者）、`b1d4eda231`（设置界面与装配）及本次修正提交；均已推送 `main`，未强推、未另开分支。
- 未完成/缺口：浏览器工具、MCP、常驻终端、委派子代理与忽略代理环境变量的程序不在覆盖范围内，界面已如实标注；HTTPS 子进程正文不可见；未做导出；未在真实浏览器中点击验证新面板（客户端组件与控制器有测试）；`10.05` 仍缺真实目标保护提供者。
- 重叠与协作：另一任务正在修改 `packages/client/ui-agent-preset`（`settings.mode.materials` 座与安全确认对话框）、`packages/api/mode-dossiers`、`packages/memory/*` 等未提交文件；本节点只注册进 `settings.mode.materials`，未改动这些文件；该座位已由并行任务在 `5324f279a8` 落地，网安资料区与网安代理区并排显示。`pnpm-lock.yaml` 已含他人未提交的条目，本节点未提交它；`verify-cordis-config`、`verify-package-dependencies`、`verify-export-jsdoc`、`verify-client-ui-i18n` 目前因他人未完成的 `memory`/`mode-dossiers` 代码而红，本节点新增代码在这些检查中没有报错。
## 模式专属资料管理节点 04.05（2026-10-24）

- 新增 `packages/api/mode-dossiers`（`@deepseek-ai/dsh-api-mode-dossiers`，Host Remote `modeDossiers`）与 `packages/client/ui-mode-materials`（`@deepseek-ai/dsh-client-ui-mode-materials`，设置面板）。`packages/client/ui-agent-preset` 只新增 `settings.mode.materials` 槽位声明、卡片下方渲染位与一行测试夹具的 `renderSlot`；模式卡片、默认模式与既有会话切换逻辑未改。
- 存储：网安/逆向案件沿用 `casefile.mjs` 的格式版本 1（`.security/<slug>/case.json`、`.reverse/<slug>/case.json`），四个记录集合、严重级别词表、证据编号校验、报告 Markdown 与该脚本一致；写入使用组合文件系统的版本保护（`replaceIfVersion`），冲突返回 `mode-dossier/conflict` 且不改文件，未知顶层键与记录额外字段原样保留。写作资料为 `story/style/*.md`、`story/bible/*.md` 加登记表 `story/materials.json`，删除记录不动源文件，未登记文件可纳入。
- 请求上下文：写作模式请求在 `agent/pre-step` 收到选中资料组成的 user 角色消息（来源 `mode-dossiers`、`form: instructions`），内容即会话日志；只读取被选中的资料，未选中文件不会进入；`contextBytes` 默认 16 KiB，单文档上限 8 KiB，截断有标注。选择未变化时不重复注入。
- 逆向面板的样本清点只读字节（SHA-256、容器签名、熵、有界字符串），不执行样本；工具列表如实显示内置能力可用、IDA/Ghidra/REA/Frida 未接入，不下载、不安装、不探测。
- 未实现项按未实现显示：生产/测试目标保护、境内域名保护、独立代理（`10.02`—`10.05`）与跨对话记忆（`13`）均未接入；界面明说目标只是案件资料，不产生执行保护；也没有用 localStorage 之类冒充跨会话存储。
- 验证：`tsc -b packages/api/mode-dossiers/tsconfig.host.json` 通过；Host 测试 35 项、客户端组件测试 7 项通过（`vitest run packages/api/mode-dossiers/tests`、`packages/client/ui-mode-materials/tests`）；`pnpm --filter @deepseek-ai/dsh-client-ui-mode-materials bundle` 成功（`lib/client.js` 85.8 kB）；`verify-client-packages`、`verify-export-jsdoc`、`verify-client-ui-i18n`、`verify-package-dependencies` 对本节点新增包无报错；两个新包的 README 中英配对已记录。
- 阻塞与边界：完整 `build:artifacts` 未能跑通——Client 编译器当前因另一任务未提交的 `SessionStore` 漂移（`ui-chat`、`ui-approval`、`ui-sidebar-right`）失败，属既有 `17.06` 债务；`generate-typert` 也因他人未完成的 `@deepseek-ai/dsh-memory/types` 路径映射失败，本包产物已在先前一次成功运行中生成（`lib/typert.host.*`、`lib/typert.remote-client.*`）。因此本轮**没有**真实浏览器截图：Web 前端无法构建，运行中的 127.0.0.1:62766 是已安装的旧打包产物，不代表本节点代码。深浅主题与 390px 窄窗口的浏览器验收仍需在 Client 编译恢复后补做。
- 协作：`settings.mode.materials` 槽位同时被 `ui-security-proxy` 使用（它读取 `modeId` 并只在 `security` 渲染），两者共存；`ui-mode-materials` 的面板 id 为 `security`/`reverse`/`writing`，顺序 10/20/30。本节点未打包、未安装、未发布。
