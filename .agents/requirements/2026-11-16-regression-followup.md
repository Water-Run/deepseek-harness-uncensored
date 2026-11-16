# 完整回归后续核验

当前安装版为 `2026.11.16.1`。本页保留[基线 4](2026-11-15-regression-baseline.md#新基线)之后的定向核验及新基线 5；基线 4 的 1,073 通过、12 失败和 34 跳过保持原记录。

## 主题、首页与设置入口

- 首次配置与滚动条测试显式选择初始浅色主题，再通过真实设置切换深色。原问题来自默认日出日落主题在夜间进入深色，而预期仍要求浅色；没有修改产品默认主题或颜色值。
- 首页点击诊断记录到 `data-dsh-theme-reveal` 仍存在，命中的是过渡画面而非首页内容。场景等待该状态结束后再点击，保留光点像素、浅深色、窄屏、减少动效与输入独立断言，没有增加固定睡眠或重试。
- 模拟 macOS 收起侧栏后，账号按钮在 DOM 中仍可能可见，却已被中栏覆盖。设置助手按实际收起状态展开侧栏，并区分专用入口与列内同名按钮；继续通过账号菜单打开设置。用例明确核对两种起始状态的入口和控件可达性，不把展开后的模态布局描述成收起侧栏布局。
- Windows 工作树的滚动条几何预期残留 CRLF，与提交内容转换为 LF 后完全相同。恢复该文件的已提交 LF 字节后，原颜色和几何预期通过，没有修改预期值或放宽正常化规则。

Windows 首页 5 项、首次配置 4 项通过；滚动条 9 项通过后，LF 修正对应的几何项单独通过，共 10 项取得通过记录。窗口拖拽最初 18 项中 2 项出现目录选择/启动超时，之后定向 2 项通过，最终整文件 18 项只读复验全部通过；旧失败保留，不能将后续通过等同于根因已修复。启动失败现在会记录页面错误、警告与截图。

证据位于同日交付目录：`cohort-u-whale-diagnostic`、`cohort-u-whale-click.json`、`cohort-u-windows-readonly`、`cohort-u-windows-scrollbar`、`cohort-u-windows-scrollbar-lf`、`cohort-u-windows-drag-focused` 和 `cohort-u-windows-drag-final`。

## Worker 预览候选

Worker 预览仍未通过完整验收。当前候选补齐裸 `node:assert` 的导入及 CommonJS 可调用语义；4 项新回归在修复前失败，修复后通过。浏览器 Fetch 适配支持平台请求与响应，拒绝自定义分发器、原生连接池和代理，不会把要求代理的请求改为直连。候选还修正了 Windows 静态测试服务器的 URL 分隔符映射。

模块导入修正后，实际预览暴露的下一处阻塞是 `node:sqlite`：Worker 没有真实 SQLite 账本，额度守卫继续拒绝付费请求。既有拒绝用例验证提供方请求次数为零；未关闭额度守卫，也未将该错误从预览检查中滤掉。这里不能以显示正常或原生 Desktop 的 SQLite 通过代替 Worker 后端验收。

相关 46 项单测及相邻拒绝/模块表用例通过，产物构建及 Host/Client 聚合检查通过；实际预览仍失败，日志为 `worker-fetch-preview`。候选代码留在当前工作树，不包含在本轮完成项提交中；已另存到 `%USERPROFILE%/DSHU-Deliveries/20261115/worker-preview-candidate`，包含逐文件摘要、完整文件与 tracked patch。后续先核对 `manifest.json` 与工作树，避免覆盖或丢失这些改动。

## Ubuntu 迁移窗口

用户在 C 盘迁移对话明确授权“和他沟通，进行迁移”。本对话确认 Ubuntu 测试结束并回复“Ubuntu 可以暂停迁移”；迁移窗口内没有启动该发行版，仅进行 Windows 工作，未更改 WSL 配置或操作 Docker。随后已收到完成通知并恢复核验。

私有检出 `/home/linzh/.cache/dshu-verification/linux-rc2-20261113.iLMw1C/source` 保留候选测试与界面预期。本批迁移前的 Linux 运行是 48 通过、2 失败的候选刷新，不能称为整批最终只读通过。交接回执为 `ubuntu-migration-handoff.json`。

迁移对话随后通知已完成：Ubuntu 注册于 `D:/WSL/Ubuntu`，已确认私有检出可访问且有 8 条未提交状态，可以恢复使用。完整导出备份位于 `D:/Codex-disk-relief/ubuntu-pre-migration-2026-11-15/ubuntu-backup.tar`。迁移完成本身不代表待验场景已通过；恢复后的核验见下节。

## 旧 Minimal 界面预期

迁移后已核对并保存三份候选及原始预期，逐文件摘要位于 `minimal-candidate-after-migration/manifest.json`。差异仅为顶部旧模式标识由 `minimal` 显示为本地化的 `Minimal mode`，与已有产品修复一致；未修改 Session JSONL、命令、提示词或工具输出。三份界面预期已按审阅结果同步到主仓库。

在私有 Linux 检出以 `DSH_SNAPSHOT=replay` 执行原始 `minimal-preset.snapshot.ts`，13 项全部通过，包含命令、手动压缩、图片与持久化重开。日志和 JSON 为 `minimal-after-migration.*`。此项定向通过不改写原完整基线的失败数字；Worker 预览的 SQLite 缺口仍保留。

## 新完整基线：web-baseline-5

源码 `f8c87121c7184df3835225d71e6afd1619f54c08` 在干净私有检出重新完成产物与聚合构建，先顺序运行 HMR、动态客户端和 SVG 三组，再以 4 个 Worker 运行其余 Web 文件。前置 10 项通过；主批次 1,072 项通过、3 项测试失败、34 项跳过，另外创建页面与旧字符串编辑器的准备或收尾报错，共 5 个失败文件。最终工作树干净，日志、JSON、逐文件失败与摘要位于 `20261115/web-baseline-5/`。

- `cot-translation-paid`：选择账号翻译服务时，菜单项被模态遮罩拦截，30 秒点击失败；须诊断真实叠放，不能强制点击。
- `details-session-lifecycle`：创建终端后的 Host 列表仍为空，断言预期为 running；失败截图保留 Starting 状态，须核对创建响应、归属及就绪。
- `creation-recommendations`：UI 场景完成，持久化回放收尾发现技能目录数组顺序不同。已解析两侧目录并按名称逐项比较，内容与字段相同，仅顺序不同；所属模型可见输出需要稳定排序，原 Session 输入保留。
- `standalone-string-editor`：准备阶段仍查找 `Standard mode` 和隐藏的 PTC 选择项，随后产生未绑定回放的收尾错误；需显式组合测试入口，不能把 PTC 加回产品默认列表。
- `preview-boot`：已提交源码仍缺原生模块替代链。候选导入修正继续保留，下一处 SQLite 缺口仍未完成。

此基线取代当前进度入口，不删除 `web-baseline-4` 或之前的失败证据。已完成的 Minimal、Inspector、主题、动效及窗口入口在本轮继续通过；不能据此将全部 Web 标为绿色。

## 真实 SQLite 可行性探测

隔离目录 `20261116/worker-sqlite-probe` 保存通过 npm SHA-512 验证的官方 WASM `3.54.1-build1`。实际引擎验证了 STRICT 表、事务提交/回滚、FTS5、重开和精确 int64；使用仅服务于探测的模块替代驱动当前源码 SpendLedger，内存库中的默认关闭、预留/结算、到限额拒绝、逐项重置、未知费用、滚动过期和全部关闭通过。它没有接入浏览器 VFS 或产品，也不能替代跨句柄、文件持久化、关闭及完整预览验收。

## 批次 V：菜单裁切与回放稳定性（源码，未打包）

翻译服务菜单的失败已通过现场数据定位：说明内容晚到或滚动使锚点离开设置滚动区域，菜单仍保留打开状态，而浏览器不再绘制其锚定浮层，点击落在设置遮罩。菜单现在通过 IntersectionObserver 跟踪非指针锚点的裁切，完全离开可见区域时调用关闭；关闭、卸载和锚点替换后忽略排队通知。按指针坐标打开的上下文菜单保持原行为，没有提高 z-index、强制点击、关闭动画或增加睡眠。

翻译用例先等待说明预览解码，再操作配置；增加重复选择、受控滚动裁切、关闭及一次重开。受控浏览器场景在修复前失败，3 个生命周期单测在修复前为 2 失败、1 通过，修复后全部通过。5 文件 73 项相关单测通过；整个 primitives 包 94 文件、2,099 项单测通过。Menu.tsx 位于既有 GUI coverage 豁免列表，本次覆盖率命令未采集到此文件，不将 0/0 报表解释为 100% 覆盖。

创建页面技能的官方目录按包名排序，保留全部元数据和状态；发现顺序不再改变模型可见内容，也不修改原列表。新回归修复前失败，修复后该包 4 文件 62 项通过。所属单元快照与 writer 仅调整目录顺序，Session 原始输入未改。

终端用例改为等待真实创建响应，再检查已提交的终端；Windows 整个生命周期场景通过。旧 PTC 用例仅在私有测试注册中显式显示保留的声明，使用记录原有的 workspace-write 权限；产品仍默认四模式。当前输出以 behavior-update 的独立 writer 保存，旧 Session v4 不改写。原始输入摘要逐一核对不变。

Linux 六文件只读复验为 42 通过、1 条件跳过，包含 Chromium/WebKit 菜单几何、上下文菜单、翻译、终端、创建页面和 PTC。Windows 翻译及上下文菜单 25 项通过；目录复制以 Host 文件系统 realpath 验证确实指向目标，保留原始剪贴板值。Windows 未安装 WebKit；Linux 已覆盖该引擎。

完整 GUI 单次运行为 14,041 通过、4 失败、2 跳过。4 个既有失败来自指南关闭按钮直接指定焦点色，以及 3 项依赖旧 CSS 哈希的工厂断言。关闭按钮改用局部共享焦点令牌，视觉颜色保持原值；工厂断言检查目标和可访问名称。修正后 3 文件 172 项定向复验通过，未把它描述成重新跑完整 GUI 全绿。

额外 Windows 创建页面与 PTC 运行的 27 项行为断言通过，但两个 POSIX 持久化预期仍在收尾报告平台差异：Windows 原生 ACL 诊断技能，以及文件沙箱部分执行披露。原日志、差异及失败结果保留，没有关闭比较或过滤这些信息。Linux 的严格持久化回放保持通过。

证据位于 `20261116` 的 `catalog-order-*`、`menu-clipping-*`、`cot-anchor-clipping-negative`、`cohort-v-*`、`terminal-ptc-readonly` 和 `ptc-explicit-composition`。当前实装仍为 `2026.11.16.1`，本节源码修改尚未进入安装包。

## 批次 W：Worker SQLite 与完整预览（源码，未打包）

Worker 的 `node:sqlite` 使用固定的官方 WASM `3.54.1-build1`，事务、约束、FTS5、绑定和 int64 均交由真实 SQLite 执行。提交后将完整数据库字节写入当前 VFS；同一文件的活跃连接共享引擎文件。只读查询不重写文件，外部改写或发布失败后相关句柄全部拒绝继续 SQL。这里是单个 Worker 的内存文件系统，不保证跨 Worker 共享账本或浏览器重启后的持久保存。

初始化在 Node 全局与镜像激活前完成，实际损坏 WASM 会让启动失败并向排队请求返回 503。WASM 内嵌在 Worker 束中，构建仅保留依赖的引擎段，省去未使用的 Worker 客户端；停用可选浏览器 VFS，不另取兄弟 Worker 或 WASM。依赖布局变动会使构建失败，原有许可头保留，并补充封装、SQLite 与 Emscripten 许可原文及摘要。

未实现的原生扩展、SQL JavaScript 函数/聚合、changeset 和备份继续明确拒绝；SQLite 授权拒绝附加文件和 `VACUUM INTO`。没有伪造 Node authorizer API，可选保护仍拒绝不支持的执行器操作。浏览器 Fetch 替代原生 Undici，自定义代理、分发器与连接池在发起传输前拒绝，不回退为直连；补齐裸 `assert/strict` 导入和 CommonJS 可调用导出。

Windows 运行时与许可声明检查共 46 文件、728 项单测通过。产品 SpendLedger 不改业务逻辑，在真实 SQLite 与 Worker 文件适配器上通过默认全关、文件预留/结算、超限拒绝、逐项重置、在途保留、未知费用、窗口到期、重开与损坏拒绝。全量构建 10 项通过，包括 Host/Client 聚合；本包 JSDoc 无违规，全仓另有 11 条既有违规，未算作本次通过。实验 Worker 处于既有覆盖率豁免范围，不宣称覆盖率 100%。

原始 `preview-boot.e2e.ts` 的完整浏览器用例以只读快照模式通过，覆盖空环境和示例镜像、真实额度 API 的开关与重置、设置与凭据、会话工具、历史分页、延迟资源、可选插件和 Inspector，并断言没有额外请求 SQLite Worker 或 WASM 文件。用例显式选择紧凑工作步骤以验证折叠，产品默认仍为完全展开；插件管理通过实际设置页进入并用 Escape 关闭。没有删除功能断言、跳过组件或过滤 SQLite 错误。

日志位于 `20261116/worker-runtime-unit-final.log`、`worker-sqlite-integration.log`、`worker-sqlite-build-final.log`、`worker-sqlite-preview-final.log` 和 `worker-sqlite-jsdoc-final.log`。保留此前构建及预览失败；当前完整 Web 基线仍为批次 V 所述，不能用本次单文件通过替代新的整轮结果。

## 公开接口说明复核

日期版本辅助函数和 MCP 关闭状态原有的 11 条 JSDoc 违规已补齐描述及独立的参数/返回段，未修改运行语句。全仓 `verify-export-jsdoc` 现通过，日志为 `20261116/export-jsdoc-complete.log`。

Linux 整轮 `web-baseline-6` 使用 `65eafb6a42` 运行代码，只读快照、4 个 Worker。8 项产物、2 项聚合检查及 3 个前置文件共 10 项通过。主批次为 243 个文件通过、5 个文件跳过，1 个文件收尾失败；共 1,077 项通过、32 跳过，没有普通测试断言失败，整体仍退出 1。最终工作树干净。更新前的 11 份验证候选保留 tar、patch、摘要与 stash，不覆盖原基线。

唯一收尾失败来自旧 PTC 的 system-prompt pin：当前组合包含此前已实现的破甲提示词和 `read_side_context` SDK，而可读预期仍是上游基础提示词。该 sidecar 已从本轮备份中取出、核对原始摘要并检查差异，Linux 原始用例只读复验 2 项通过。只更新当前组合的可读提示词预期；所有 `session.*.jsonl` 原始输入逐字节不变，writer、工具 schema、工作区与 UI 预期均未修改。证据为 `ptc-header-replay.{json,log}`、`ptc-retained-inputs.json`、`ptc-root-inputs-unchanged.json`。随后再做最终整轮，不把这次定向通过写成原整轮全绿。

## 最终整轮与实包复验

`web-baseline-7` 使用干净源码 `668ec5146dfbfdcf03becae372156b78d71c509a`：8 项产物、2 项聚合检查通过；HMR、客户端插件和 SVG 三个前置文件共 10 项通过。主批次 1,077 项通过、32 项条件跳过，无失败文件，整体退出 0，最终工作树干净。四份 JSON、原始日志和最终状态保存在 `20261116/web-baseline-7/`，先前各轮失败没有覆盖或删除。

该源码已生成 Windows/Linux `2026.11.16.2` 实际产物。Windows 保留数据更新与安装后检查、Linux 归档/API 和隔离 X11/Wayland 检查通过；原生探测仍记录发行 API 403，更新验收单列。[交付记录](2026-11-16-delivery.md)
