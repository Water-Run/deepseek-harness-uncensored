# DSHU 下一版接手文档

更新于 2026-11-26。面向接手主线开发、专项模式、桌面安装和发行验收的维护者。正式版须交付缺省、写作、网安、逆向四种模式。通用与写作候选可以独立验证和推送。涉及自动攻击、漏洞利用的专项执行链由维护者接手，专项验收完成前，完整内核升级和新版发行保持待完成。

[正式版接手清单](#正式版接手清单) · [合并后的关于页](#合并后的关于页) · [版本身份](#版本身份) · [七项需求](#七项需求如何验收) · [复现](#从干净目录复现) · [保留资料](#旧资料与问题-20) · [平台验收](#桌面与平台验收) · [交付顺序](#交付顺序与接手责任)

## 正式版接手清单

**发行状态为待完成。** 下一正式版的最低范围是上一正式版 `v2026.11.24.3` 的完整用户功能，加上[本次七项变更](#七项需求如何验收)。GitHub Latest 仍指向 `v2026.11.24.3`，首发版到它的 Windows 静默升级存在[已复现的问题](#issue-24-的首发版静默升级)。本次 `2026.11.25.0` 的 Windows、Linux 验收包仅含缺省和写作。关于页列出的 dsh-purge Community 和 REA 是上一正式版的组件参考，两者均未随此候选交付。

**先建立对照。** 从上一正式版的 GitHub Release 记录取平台、附件名、字节数和摘要，保留一份干净旧版及一份受控旧资料。用相同平台、配置和账号类型检查最终拟交付的安装文件。主线、还原后的两模式内核和最终四模式安装包要分别标识。将本次实际候选的源码提交、候选树和 SHA-256 写到每份回执上。重新打包后重新核对该文件。[上一正式版](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.24.3) · [该版功能说明](https://github.com/Water-Run/deepseek-harness-uncensored/blob/7eaeddc6050ee60e114cc3ef0d81de9c1371aacd/README.md)

| 对照项目 | 接手者在最终安装包上核对什么 | 当前能交接的结果 |
| --- | --- | --- |
| 四种模式与旧会话 | 核对缺省、写作、网安、逆向的现有入口、可选范围、设置保存和旧会话归属。升级、重启、分叉后逐个检查原模式。记录任何消失、被重映射或无法打开的入口。 | 现有新版安装包仅覆盖前两种。另两种模式和专项能力的实际交付由对应维护者独立确认。 |
| 随包组件与工具 | 上一版公开元数据记录 dsh-purge Community 1.7.20、REA 6.9.0，REA 的 `toolCount` 为 255。区分发行清单登记、实际安装内容和当前会话可见项目。登记数量相同也可能有同名替换、缺项或重复项。 | 两模式候选的组件参考、关于页截图和通用工具测试均不能证明这两项随包或可用。专项验收待维护者提交对应安装包的结果。 |
| 通用工具与插件 | 在相同设置下按稳定标识逐项比较旧版和最终包。分别记录已安装、可发现、已启用及用户手动停用的项目。以无害样本实测文件读取、文件搜索、终端收发、图片及文档处理、离线插件安装与移除。升级后复核用户自己安装的插件。 | Linux x64 的通用运行时检查见下文。最终四模式包还须重做。版本号、工具总数、菜单文字不能代替逐项结果。 |
| 已有使用范围 | 原先可用且未设限的通用能力须维持原有范围。对照新旧的开关状态、可填值、最大最小值、是否允许留空或不限、账号/API Key 路径、工作区范围以及离线可用性。用新资料、已保存非默认值和已有未设限配置各测一次。 | 用户主动设置的限额和旧偏好需要保留。本次明确变更的默认值见七项需求。新增强制登录、额外配额、必须启动外部服务、固定上限或禁用原入口，均须作为差异处理。 |
| 既有对话与写作 | 复核 `/side` 与 `/btw`、输入建议的采纳与放弃、写作资料、置顶排序、归档找回、分叉、删除与工作区文件保留。分别从冷启动及已打开会话进入。 | 输入建议事件和两份旧版写作资料已有实测。已发布的 66 个事件名中仍有一个 `target/admission` 待对应维护者判定。 |
| 计费、记忆与外观 | 检查对话费用与曲线、底栏用量、限制进度、主题与模式色、跨对话记忆、额度设置、双端拖动和侧栏余额。分别比较旧账号、新账号和自定义设置。 | 新版记忆默认关闭，余额自动清理默认开启并保留 30 天。仅移除截图所指的插件“更多”入口。账号菜单、普通插件入口和原有会话操作应可达。 |
| 平台覆盖与安装升级 | 对每个公开交付的平台、架构和安装形式，检查全新安装及保留资料的覆盖升级。通过应用自身的更新入口，从首发版、上一正式版各演练一次。核对下载文件、版本登记、原安装位置、旧资料及更新后实际启动的程序。 | Windows 两个起始版本的安装器覆盖与 Linux x64 两种包管理器的验收范围见下文。macOS 的 #20、真实在线更新以及尚无实机回执的平台仍待完成。 |

每项差异单独占一行。回执字段为“旧版实际行为、候选实际行为、复验操作、平台与配置、安装包摘要、证据位置、负责人、结论”。用“通过”“本次明确要求变更”“缺失或退化”“待验证”四种结论。标为“本次明确要求变更”时附用户需求或已确认的变更记录。工具更名还要留旧标识到新标识的对应和已有配置的复验结果。旧版未设限而新版增加限制、组件缺失、旧会话打不开，以及缺少专项结果的情况，都保持待发行。

### 从上一版建立逐项差异表

打开固定版本的使用手册、默认设置表和功能入口速查，在上一版安装包中从新会话走到设置、账号菜单、工作区和更新入口。将每个可操作项和保存的用户选择各登记一行。再从旧 profile、应用实际展示的通用插件与工具清单补齐文档里没有列出的项目。逐项记录平台、登录方式和开关状态；只在某个平台存在的功能写明平台。发现旧手册与实装不符时同时记录两者，以旧包可复现的行为作对照。[上一正式版使用手册](https://github.com/Water-Run/deepseek-harness-uncensored/blob/7eaeddc6050ee60e114cc3ef0d81de9c1371aacd/docs/user/guide/dshu.md) · [上一正式版 README](https://github.com/Water-Run/deepseek-harness-uncensored/blob/7eaeddc6050ee60e114cc3ef0d81de9c1371aacd/README.md)

| 容易在合并时遗漏的通用功能 | 在最终安装包内检查 |
| --- | --- |
| 创建与输入 | 从欢迎页进入工作区，创建新对话。试用模式菜单、斜杠命令、`@` 引用文件与会话、附件、输入预测、旁问的各个入口和随问。旧会话中的预测、附件和引用在冷启动后仍可读取。 |
| 对话与写作资料 | 加载旧文风卡及设定集，检查已有选用范围。核对会话模式色条、运行与等待标记、置顶与普通会话分区排序、分叉模式归属和归档找回。在测试资料中删除会话，确认关联子会话按原规则清理、工作区文件保留。 |
| 额度与账户 | 旧版的六档额度限制在新装时均关闭，额度自动恢复也默认关闭。分别用旧版未设限资料和开启某档的资料升级，核对设置、各窗口用量与底栏进度。检查轮次、步数、生成速度、token、缓存、费用曲线和多账户采样隔离。 |
| 个性化与插件 | 对照日出日落、浅色、深色、跟随系统，以及输入预测、旁问上下文清理等偏好。检查正常的插件管理、移除、设置入口和此前由用户停用的通用工具。 |
| 数据与应用身份 | 在默认目录和自定义 `DSH_UNCENSORED_HOME` 各走一次升级与冷启动；与官方版并存时核对两套应用标识、程序、数据目录、CLI 与更新源。核对用户工作区、配置和本地备份可恢复。 |

在最终候选的交付记录里复制下表，按实际结果增行。下面是将上一正式版与候选树 `48ba9a1a8695` 对照后已经找到的差异。每个旧版入口和已登记的通用工具都应有可追溯的行；只有数量、只记录抽样或只有上一轮构建截图的项目，结论保持“待验证”。

| 项目 | 旧版实际行为 | 当前候选与证据 | 最终包、平台、负责人和结论 |
| --- | --- | --- | --- |
| 原会话输入建议 | 两个正式版可写出含输入建议的压缩会话。 | 候选安装后能续写，重启后读回同一条建议与消息。[Windows 回执](#含输入建议的旧会话) · [Linux 复验](#在-linux-安装目录复验旧会话) | 当前两模式候选已有实测；最终四模式包待复验。 |
| 输入预测的生成与采纳 | 默认启用，输入框能生成建议，用户可以采纳、忽略或关闭预测。[旧版键盘交互用例](https://github.com/Water-Run/deepseek-harness-uncensored/blob/7eaeddc6050ee60e114cc3ef0d81de9c1371aacd/packages/client/ui-conversation/tests/prediction-keymap.client.spec.tsx) | 候选主输入框已恢复生成建议、Tab 采纳、继续输入忽略和持久化开关。实际浏览器走 Host RPC 与可控模型，已验证以上四项。 | Windows 未签名候选已从主输入框、旧旁问和随问实测 Tab 采纳及冷启动。完整发行包须用同一组旧资料复验，详见下文。 |
| 旁问与随问 | 支持 `/side`、`/btw`、会话顶部及右侧开始页入口。[旧版控制器用例](https://github.com/Water-Run/deepseek-harness-uncensored/blob/7eaeddc6050ee60e114cc3ef0d81de9c1371aacd/packages/client/ui-commands/tests/asides-controller.client.spec.ts) | 候选 Web 可发起随问，从三个入口打开同一旁问，发送图片并在窄屏重开续聊。Host 可按父会话找回上次清理后的旁问。 | 手动清理和按设置在关闭后清理均已在候选 Web 版验收。主线主动读取当前旁问已通过浏览器验收。顶部入口、页签和工作区父行的状态提示已接入。最终安装包仍需复验两类问答。用例和验收步骤见下文。 |
| 日出日落外观 | 新装默认 `sun`，可以选择浅色、深色、跟随系统或日出日落。[旧版主题设置](https://github.com/Water-Run/deepseek-harness-uncensored/blob/7eaeddc6050ee60e114cc3ef0d81de9c1371aacd/packages/client/ui-theme/src/theme-settings.ts) | 较早的 Linux 实装树只接受三个选项。候选树 `06ded7caa7a9` 已恢复日出日落默认值、手选城市、时区估算、首屏及欢迎页外观。 | 126 项定向测试、完整构建 10 项通过。真实设置页验证新装、修改城市、重载及 390 像素宽的深色切换。最终安装包仍须独立核对。 |
| 关于页检查更新 | 可在应用内检查 GitHub 更新。 | 新内核的关于页已恢复自动查询、手动重查和发行说明。桌面左侧及移动端顶部显示 DSHU 产品版本，右侧来源区显示 DSH 内核。比较使用产品日期版本，区分开发候选领先、已是最新版、有新版、离线与请求失败。 | 38 项定向测试通过。构建后的中英文页面以受控 GitHub 响应验证初次检查、手动查到新版与发行说明地址，覆盖 1440、1280 和 390 像素宽。最终签名包的真实在线升级仍待实测，见 [#24](https://github.com/Water-Run/deepseek-harness-uncensored/issues/24)。 |
| 已配置插件的只读清单 | 上一正式版通过“设置 → 插件 → 插件列表”按模式或全局配置查看实例。 | 新内核的插件管理页接回“插件列表”标签，保留原配置行 ID。安装与开关仍由插件管理页负责。[插件列表复验](#插件列表与插件管理) | 最终四模式安装包须按自己的安装器摘要复验。 |
| 填入具体入口、设置或稳定标识 | 填旧包版本、前置配置、用户操作与实际结果 | 填新包的同一操作、结果和差异，附回执或截图位置 | 填最终包 SHA-256、平台、负责人、四种结论之一 |

#### 旁问、随问与输入预测的功能回归

开发对照以正式版 `v2026.11.24.3` 的用户入口和现有主线测试为起点。以下结果都要在还原的新内核上取得。主线中的通过记录不能代替新内核的结果。

- [x] **Host 旁问创建与续聊。** 对同一父会话并发调用 `session/aside`，`kind` 取 `side`，两次应返回同一个子会话 ID。新旁问继承主会话的工作目录、模型和权限。打开不会触发模型请求。父会话访问被撤销时，提交续问应被拒绝。覆盖用例在候选目录的 `packages/api/session-controller/tests/side-session.host.spec.ts`。
- [x] **从旧正式版找回旁问。** 从仓库根目录运行 `node scripts/verify-kernel-released-data.mjs <旧正式版目录> <已还原并安装依赖的候选目录>`，分别选择 `v2026.11.23.0` 和 `v2026.11.24.3`。写进程使用旧版控制器开始旁问、发送问题、执行手动清理、在新一代旁问中继续讨论，再更新主线。候选第一次启动应找回清理后的那一代，读得到上一代，但向上一代提交消息须返回 `side-context-cleared`。测试用可控模型检查续问能看到原有问答和后来完成的主线进展。当时仍在进行中的主线草稿不得进入请求。第二次冷启动再读两边记录，确认新增回答落在旁问，主线没有旁问消息。候选树 `887481dbbbe35fef887825be8c1c6b3a27f5e8e2` 已完成两版复验，每版各有 37 个旧文件与留存原件的 SHA-256 一致。
- [x] **三个旁问入口及图文续聊。** 在还原的候选目录运行 `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/persistent-side.e2e.ts`。主会话完成第一轮并保持第二轮运行，用键盘从顶部打开旁问，核对模型调用计数；关闭后从主输入框发送带 PNG 的 `/side` 问题。用例在模型请求中核对图片字节、已完成的主线回答及进行中的草稿隔离。再次关闭，从右侧开始页找回回答，在 390 × 844 的视口续问。两次回答应属于同一个旁问，主线继续运行，工作区不应新增分组。Host 保存后会释放空闲写入实例，面板的输入框应始终可以继续输入。该场景曾因空闲释放被误报为会话删除而失败。
- [x] **旁问清理与设置。** 在候选目录运行 `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/persistent-side.e2e.ts`。在旁问内发送 `/clear`，清理后在同一面板输入下一问，核对实际模型请求中保留主线已完成的回答、没有上一段旁问。打开通用设置，确认“旁问关闭后自动清除上下文”初始为关闭；开启并刷新，设置和旁问回答均应保留。折叠和展开侧栏后仍可读，真正关闭标签后重开应出现空白旁问。点“清理对话记录”会再开始一段。整个过程中主线任务持续运行。
- [x] **旧标签与重复清理请求。** 运行候选 `packages/api/session-controller/tests/side-session.host.spec.ts`。用可控模型让旧旁问持续运行，另一个输入停在附件接收阶段。同时两次清理同一代。旧旁问停止，延迟输入返回 `side-context-cleared`，新旁问只创建一次并沿用旧旁问的模型和权限。关闭自动清理时，关闭标签后仍回到原记录。
- [x] **主会话主动读取。** 在缺省和写作模式各创建一个主会话，在旁问中确认一个只出现于旁问的细节，例如装帧用棉纸。回到主会话，要求读取刚才的旁问。第一次模型请求没有该答案，调用 `read_side_context` 后的请求应包含答案，主会话工具记录可查。旁问会话中不会增加用户消息，也不会因为主会话读取而恢复运行。清理旁问后再次读取，只返回新一段讨论。若读取期间另一个窗口完成了清理，本次结果应提示重新读取。候选的浏览器用例是 `apps/web/tests/persistent-side.e2e.ts`，Host 回归是 `packages/api/session-controller/tests/side-session.host.spec.ts`。
- [x] **旁问状态。** 在候选 Web 版的工作区创建一个有标题的主会话，让主线空闲。发送旁问后，顶部入口和页签显示进行中，工作区内所属主会话显示虚线圆环。折叠右侧栏，让旁问在后台完成。顶部应显示未读，刷新仍是未读。打开旁问看见答案后，入口和页签均应变为已读。用另一个同源窗口检查阅读位置同步，刷新后应保留。取消正在运行的旁问应显示中断，清理后空白新旁问没有状态点。复验命令为 `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/persistent-side.e2e.ts -t "background side answer"`。
- [ ] **最终安装包与资源。** 在最终包带入旧资料，重复上一项操作，另开普通分支检查工作区导航。对同一父会话并发打开、关闭、重开，核对 Host 打开次数和订阅释放。在 Issue #26 的 Windows 长时间静置验收中分别记录侧栏折叠和展开时的内存、句柄、连接数。
- [x] **候选 Web 随问。** 候选树 `5c766be8b7f3d3cadd59fd1ef963c581e3d3f93a` 已在新目录按固定内核标签还原。在还原的候选目录运行 `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/quick-question.e2e.ts`。用例保持主写作任务运行，桌面输入框发送第一次随问并关闭回答，再在 390 像素宽的窗口发送第二次。检查实际模型请求中的主线进展、输出上限和上下文隔离，随后从持久层重新打开两个回答，核对父会话、只读权限和记录数。主会话应只有最初的一条用户消息。同一浏览器用例还会在通用设置把思考等级从低改为高，刷新后再次打开设置核对已保存的值。

**升级后清理与故障恢复。** 用上文的跨版本脚本分别测试两版。旧正式版给旁问单独指定只读沙盒和审批策略，再保存一轮问答。候选读取、续问、清理和重开后，应在旧代里读到原回答，新代沿用旁问自己的模型和权限。单独占用旧代写入句柄时，手动清理应返回 `session/writer-held`。清理后，旧代的额度暂停应从 SQLite 中移除，主会话自己的暂停须保留。重启后用旧 ID 重试，并检查已产生部分设置记录但尚未写入模型选择的新一代能从上一代恢复设置。在浏览器用例中，切换到新一代时旧面板会一直保有引用，直到新面板可用；已保存清理结果但未成功返回响应时，可从父会话重新确认当前代。

候选树 `818b071a5c484b8f6a24d707643ac486845684c9` 已从交付补丁独立还原。来自 `v2026.11.23.0` 和 `v2026.11.24.3` 的旁问资料均通过清理、续问及冷启动复验，每版 37 个原始文件的 SHA-256 均与留存原件一致。旁问、随问、输入预测三个浏览器用例通过，其中通用设置页的产品版本与 DSHU 构建清单一致。

**主会话读取与分支恢复。** 从异常退出的主会话创建普通分支时，分支应保留之前已经落盘的片段和恢复时补上的中断记录。读取旁问或为输入预测收集背景时，应跳过中断的草稿，即使稍后又完成了一轮，也不能带出该草稿。旧旁问曾继承的主会话前缀也应排除。用 `packages/api/session-controller/tests/fork-source.host.spec.ts` 的冷启动分支用例和 `aside-question-context.host.spec.ts` 的中断、截断用例分别复验。长中文回答应在字节上限内留下可读内容和省略提示。

**窗口切换期间的回归。** 在 Windows 原生 Web 配置中分别运行缺省与写作模式的旁问用例。清理请求尚未返回时，旁问面板应显示加载提示，输入框仅在新会话可用时出现。测试会主动延迟清理响应，在恢复后的输入框发送新问题，再从主会话读取答案。另用 `apps/web/tests/subagent-fork-schedule.snapshot.ts` 回放主会话委派任务及子会话冷启动。子会话历史中的父会话工具清单仍可查，子会话自己发起请求时应移除 `read_side_context`。两项委派用例已在 Windows 用原生 PowerShell 工具清单复验。合并后的 Linux 或 macOS 验收应在该系统上运行同一文件，核对相应的 Bash 清单和会话记录。

候选树 `f605a70b2917266e07b751cc99de8992aa133695` 已从交付补丁独立还原。分别由 `v2026.11.23.0` 和 `v2026.11.24.3` 的原版控制器创建主会话与旁问。候选首次启动后，读取旧旁问的工具声明与旧版一致，答案仅在工具返回后进入主会话。再次冷启动时无需模型调用即可找到同一条工具结果，旧旁问事件逐项相同。每组 40 个原始文件均通过 SHA-256 对照。Windows 上六个 Web 用例及三项会话快照资料检查通过。Linux 验证机本次连接被拒，原生 POSIX 回放待复验。

旁问读取沿用正式版工具名称、说明和空参数声明。用 DeepSeek-V3 分词器对 Web 工具清单的紧凑 JSON 单独计数，加入这条声明后从 7,108 增到 7,143 个 token。这一数字只度量工具清单；判断第三方 API 的缓存命中仍需服务商实际返回的用量。

**阅读状态的保存与升级。** `sessionListMetadata.side` 随会话摘要传给客户端，记录代数、第一条自有事件的位置、是否提问及最近结束的一轮。候选根据原始事件恢复这些值，继承的主线消息不计入旁问结果。用上面的跨版本脚本在首次读取和再次冷启动时核对代数、问题标记和结束序号。顶部入口使用现有列表订阅，运行提示不会定时请求 Host。已读位置由同一浏览器的窗口共享，键为 `dshu.aside.read.<主会话 ID>`，值包含 `child` 和 `seq`。当前页签、文档均可见，且回答结束事件已到达该面板后，才可记录已读。延迟到达的旧代确认不应覆盖新代，禁用本地存储时仅记住当前窗口的位置。用 `packages/client/ui-commands/tests/aside-reads.client.spec.ts` 核对这两种情形。

候选树 `b738adb9fcf1e7d16c1857aaf8a5cb8706a64e53` 已从交付补丁在空目录独立还原。Windows 上缺省与写作旁问、后台阅读状态、随问和输入预测共五个 Web 用例通过。另在两个真实浏览器页签验证同源阅读位置同步，并检查工作区运行虚线环和未读状态点的实际渲染。两个旧正式版分别写入资料，由这个候选首次读取并再次冷启动，均能恢复旁问摘要中的结束序号，每版留存的 40 个原始文件 SHA-256 均一致。候选完整构建的十项检查和文档的 43 项检查通过。

三个入口接入后的候选树为 `6074888025fe11a632e4cced09c319e4ad248874`。从清单还原到新目录得到同一树；旁问与随问两个浏览器用例通过。上述跨版本脚本也在此树上分别读取 `v2026.11.23.0`、`v2026.11.24.3` 的写入结果，两版各有 37 个旧文件与原件的 SHA-256 一致。

主线回归样本包含 40 条带表情符号的长待办、一个中文进度回复和一条长输入。修复前，配置 1,024 或 8,192 字节时，同一个随问快照均达到 38,595 字节。修复后，两种配置下整个快照均在上限以内，并保留当前运行状态、最新进展和完整的 UTF-8 字符。另一个样本先保存待办，再清空清单并发起尚未执行的写入，随问从已提交的 `todo/write` 读取当前清单。会话循环测试在模型适配器收到的请求中核对了完整快照。模型没有声明思考等级时，以前会因 `UNSUPPORTED_REASONING_EFFORT` 在调用适配器前失败。现有主线用例验证这类模型可以回答随问，并保留 512 token 的默认输出上限。候选浏览器已核对无思考等级模型的真实请求。长快照和进行中的清单由候选的 `packages/api/session-controller/tests/aside-question-context.host.spec.ts` 覆盖。最终安装器还须复验实际服务商、思考偏好、中文输入法及同一批旧会话。

**旧随问读取实测。** [跨版数据用例](../../kernel/0.2.3-alpha.2/verification/released-data.spec.ts.in) 在 `2026.11.23.0` 和 `2026.11.24.3` 的生产会话控制器中分别创建随问，各自使用原版基础配置中的权限预设、实际会话循环和可控模型，保存主线与随问的 zstd 日志。树 `5c766be8b7f3d3cadd59fd1ef963c581e3d3f93a` 在两个独立读进程中核对父会话 ID、双方各自的真人消息和回答、只读预设，以及随问记录中的父会话进展。每版各有 33 个原始文件的 SHA-256 一致。候选浏览器中发起新随问的实测见上方“候选 Web 随问”。
- [x] **主输入框预测。** 树 `d26870c07a074e70d3a913ee8904e4c5eeda981b` 中，新用户默认开启输入预测。Web 界面从缺省工作区发出普通消息，再对两份草稿各生成一次建议。第一次继续打字，第二次按 Tab，Host 只收到最初那条用户消息。随后从“设置 → 通用”关闭输入预测，重新加载后开关仍然关闭，再打字没有新增请求。
- [ ] **最终安装包与旁问、随问。** 在最终包中分别从主输入框、旁问和随问触发预测，检查上下文归属、费用和 Tab 的行为。用旧版写出的未压缩 JSONL 和 zstd 会话分别续写一轮，再次重启核对原预测、已发送消息与费用记录。记录安装器 SHA-256、系统和设置值。

在还原后的候选目录运行 `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/input-prediction.e2e.ts` 可从页面复验。这个用例通过实际的会话 RPC 与录制的模型响应运行，无需密钥。Host 用例 `packages/api/session-controller/tests/prediction.host.spec.ts` 按旧版样本核对写入的消息、路由、结果和 token 用量；`packages/client/ui-conversation/tests/input-bar.client.spec.tsx` 检查草稿过期、界面重新绑定、输入锁定和访问权限。Tab 在光标处于末尾时采纳，补全菜单优先，输入法组字期间保持原有键盘行为。设置保存失败会提示用户。

#### Windows 安装版的三个输入框

在关闭外网的 Windows Sandbox 中，用 `2026.11.24.3` 安装版的存储组件创建写作会话和旁问，再用候选 `b738adb9fcf1` 打开。主输入框、旧旁问和以 `/btw` 开头的主草稿均显示了模型返回的灰色后缀。按 Tab 后草稿发生变化，模型端没有收到用户消息。再按 Enter，旁问和随问各自收到回答。主输入框和旁问的预测包含已完成的主会话回答，随问预测只收到运行状态。三次均使用无工具的本机可控模型响应。候选续写后，在全新的 Windows Sandbox 重新安装程序、恢复资料并打开旧旁问，原回答和新增回答均可见。

**会话费用的对照方法。** 从上述安装版保存的同一组日志中选出三份草稿的请求 ID。分别计算完整日志和剔除这些请求及结果后的会话费用，保留其他事件和原始序号。每份响应记录 12 个输入 token 和 4 个输出 token，样本配置的费率为每百万输入 2 元、输出 8 元。旧候选少计三次。候选 `4881f747e2dc` 对主会话增加 2 次、0.000112 元，对旁问增加 1 次、0.000056 元。这些数值验证本地估算。单测 `packages/guard/spend-limit/tests/session-usage.spec.ts` 另覆盖缺少标识、取消、继承的请求、交错返回和同一步重复结算。

**旧写作样本的构造。** `windows-retained-writing.mjs` 在主会话和旁问的第一步先写入可替换的系统消息，再写入用户消息。主会话含 2,225 条事件，旁问含 8 条。较早的静置测量使用 2,224 条和 7 条，其数据和回执保留在下文。那组样本省略了首条系统消息，可以阅读。用桌面续写后再重开，读取器会报 `system/message requires a protected first surface head`。该失败来自人工构造的历史。遇到相同错误应保留原文件、核对首条消息和写入来源，单独验证用户原始资料。

**在费用窗口复验。** 从交付补丁独立还原树 `4881f747e2dc3bee06c52a37426a2ade91a72a3b` 并打包。Windows x64 未签名安装器为 325,317,987 字节，SHA-256 为 `dcf3987ff8bdffb1af315b95dc5a4f22dc44674cfe4af86c24e83842588b5042`。用此包重复三个输入框的操作。在旧旁问按 Tab 采纳补全，发送前立即点击底栏“本对话费用”，显示至少 0.000056 元，共 2 次请求，其中旧回答缺少用量。按 Enter 发送并收到回答后，在全新的 Windows Sandbox 恢复资料。旧旁问的两个回答都可见，底栏显示至少 0.000112 元，共 3 次请求，其中 1 次无法计价。安装器、blockmap、金额截图和各阶段回执保存在 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-x64-candidate/4881f747e2dc/`。

**两种存储配置的升级。** 分别安装 `2026.11.23.0` 和 `2026.11.24.3`。各用原安装版在两个独立目录创建一份未压缩 JSONL 和一份 zstd 数据。用上述候选静默升级，在原压缩配置下续写两份资料，同版重装后读回原消息、续写的消息和原预测记录。四种组合全部通过。升级和同版重装返回 0，降级和无效版本登记均返回 2。复验脚本接受两个安装器路径及各自版本，在一次性 Windows 账号中运行。两个原版都要求已有资料目录使用与文件匹配的压缩配置。[Windows 安装升级检查](../../kernel/0.2.3-alpha.2/verification/windows-installer-upgrade.ps1)

跨对话记忆安装验收锁定的源码树为 `d75d00fb91e0eefa4bd271d874b28b25004a6685`。与上述费用实装树之间只有 `StatPopover.tsx` 中的 TypeScript 参数声明排版差异。两份组件编译为相同的 JavaScript。锁定树已另行打包，安装器摘要和实装结果见[安装版写作记忆](#windows-安装版的跨对话写作记忆)。

跨版本读写另有独立回执。两套正式版写入器分别创建旧资料，再由包含新预测实现的树 `56c4022f165e67dbaf5c8b3fe86a5bec0b2cb4f9` 读取、续写和重开。`2026.11.23.0`、`2026.11.24.3` 两组各核对了 30 个原始文件的 SHA-256。到上述候选树之间的差异只涉及网页测试和队列快照。此处的早期 Windows 安装包早于输入框接入。后续 Windows 安装器对旧对话及旁问的实测见[保留资料对照](#保留旧写作会话的-windows-安装包对照)。正式包仍须核对三个输入入口的预测生成、采纳及费用。
- [ ] **合并与实装。** 新内核将会话列表元数据放在 `packages/session-query/session-query`，输入栏在 `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`。沿用新内核的会话归属、工作区选择、草稿迁移和输入权限。装包后从原有写作会话重开旁问，关闭所有视图，记录用户入口、会话历史及本机资源采样，再更新上表结论。

### 合并后的关于页

候选的“设置 → 通用”底部读取与侧栏、关于页品牌区相同的 DSHU 产品版本。浏览器回归从侧栏读取实际显示的四段日期版本，再打开通用设置核对“当前版本”。合并后要在安装包中对照这三处，并单独核对关于页右侧的 DSH 内核版本。

| 位置 | 最终包的验收条件 |
| --- | --- |
| 左侧品牌区 | 保留鲸鱼、DSHU、正式产品名、标语、作者、**DSHU 日期版本**、编译时间、仓库及更新入口。桌面渐变贴齐左、上、下三边，窄屏铺满顶部。弹窗没有额外可见的“关于”标题栏，辅助功能名称和关闭按钮可用。 |
| 右侧内核与源码 | **DSH 内核版本**与实际运行内核一致。区分上游固定提交、本次 DSHU 源码标识与构建时间，分别打开链接核对目标仓库和完整 SHA。提交时间对应所示提交。 |
| 右侧组件与许可 | 按该安装包的实际交付状态展示组件名称、版本、源码节点、提交时间、许可和第三方声明。区分随包提供与需用户另行配置的部分。候选当前的“发行版组件参考”和“未包含”反映的是两模式包；最终内容需根据最终载荷重新生成并实查。 |
| 发布与更新动作 | 复核仓库、使用手册、许可证、第三方声明及 Release 链接。正式包应保留上一版可直接检查更新的入口。检查当前已是最新版、有新版、离线或请求失败的反馈和重新检查动作。实际版本来源、链接目标和用户提示必须相符。 |
| 候选痕迹与文档 | 查找“开发候选”“候选源码”“查看正式版本”“未包含”等候选文案，以及指向开发分支的版本链接。逐处决定正式版正确文本和目标。用最终安装包重拍中英文桌面和窄屏，替换 README 与手册中受影响的截图、版本和下载说明。 |
| README 首页演示 | 保留“DSHU 功能演示”下方独占一行的 GitHub 视频附件地址。更新 README 后，从未登录的浏览器打开仓库首页，点击播放器，确认进度向前走且仍停留在首页。现有视频长 2 分 39 秒，分辨率为 1280 × 720，含中文配音和字幕。[视频制作与素材](https://github.com/Water-Run/ft) |

在候选树 `4d8c520d76bf28f23e4a202f57e5d0ea97d4e2a9` 构建的 Web 客户端中，从账号菜单打开弹窗，自动查询返回公开的 `v2026.11.24.3` 时显示当前候选领先。页面测试用固定响应验证再次查询发现更新、发行说明目标和状态恢复。图中是恢复到已发布版本后的界面。[桌面检查更新](../../docs/assets/dshu/about-candidate-updates.webp) · [窄屏检查更新](../../docs/assets/dshu/about-candidate-updates-mobile.webp)

Windows 安装包 `fc81c3d7…` 的关于页信息正确，但工作区标题仍为“DSH 本地构建”，侧栏显示内核构建串。候选源码树 `9138e720d7b9ed1951953f07df8ec0b2d1e271c1` 已修复这两个入口。DSHU 的本地及正式编译配置均生成产品名称，侧栏显示可复制的日期版本。构建后的中英文页面已从工作区核对窗口标题、侧栏名称和日期版本，再打开关于页核对内核与更新入口。该树的界面实测来自 Web 构建。下一批安装文件需从已安装桌面重复同一操作，并记录各平台实际标题。

先用 `--verify-build` 核对客户端构建记录，再从已安装应用的账号菜单和桌面原生菜单分别打开关于页。宽屏核对左右区域，390 像素宽核对顶栏、滚动和关闭，最后按 Esc 检查焦点。保留一张含产品版本、内核版本、源码节点的实拍，以及对应包的 SHA-256。链接可点击、出处正确、字段与安装包一致后，才登记关于页通过。

### 专项维护者待办

以下条目维持待办状态，由产品维护者指定的专项负责人登记交付结论。通用功能缺失同样属于待修复的回归，仍由通用开发者处理。

- [ ] **四模式发行范围**。登记最终安装包中缺省、写作、网安和逆向的产品状态和验收负责人。当前新内核包只有前两种。
- [ ] **dsh-purge Community**。登记上一正式版与拟发行版的组件版本、许可、实际随包状态及维护者交付结论。产品要求的既有表现由专项负责人独立确认。
- [ ] **REA 与专项工具**。登记上一版已有组件与工具的交付状态和已知差异。逐个公开平台记录维护者结论。工具总数、README 或关于页中的组件名字均不能单独作为交付依据。
- [ ] **专项执行和旧资料**。网安与逆向执行能力，以及相应历史会话的兼容性，等待专项维护者独立判断。记录适用的平台、产物摘要和未完成项。
- [ ] **统一发行**。将专项结论、通用回归结果和平台回执关联到同一批最终安装文件。任一项仍缺失时，发行负责人保持待发布。

### 发布前最后一次核对

1. 冻结最终源码和安装包清单。上一版的 10 个附件包括 Windows x64 EXE、Linux x64 DEB/RPM、Linux arm64 DEB、macOS arm64 DMG/ZIP，以及 `latest.yml`、`latest-linux.yml`、`latest-linux-arm64.yml`、`latest-mac.yml`。逐个核对新包版本、对应平台及摘要，验证索引实际指向可下载的同一文件。当前两模式候选的回执只适用于其记录的文件。
2. 在隔离测试账户中完成升级、冷启动、旧会话重开、设置持久化与故障恢复。从桌面操作实际版本检查入口。保存旧资料备份，对照更新前后的用户数据，确认回退演练的安装器与数据副本配对。
3. 由产品、专项和发行负责人分别登记结果。只要有缺失、意外新增限制或待验证项，继续保留上一正式版的 Latest 和更新索引。候选源码里程碑可照常推送到 GitHub。
4. 用同一份最终清单逐一更新根 README、使用手册、受影响包的中英文 README、升级指南和 Release 正文。分别走一遍从 README 下载、从旧应用更新的路径。复核版本、默认值、截图、附件名和对应平台。
5. 正式发布的回执应列出最终标签和提交、各平台安装包摘要、每个更新索引指向的文件、资料兼容结果、功能差异清单和最终界面截图。公开后从下载入口复核同一组文件并记录结果。

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

在能创建符号链接的 Windows 文件系统上，还原器会为新目录启用 Git 原生符号链接。检查 `apps/cli/tests/profiles/acp/cordis.yml` 时应能读到它所引用的会话测试配置。若文件只包含一行相对路径，核对检出目录的 `core.symlinks` 和当前 Windows 账号创建符号链接的权限。

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

构建后，在主线根目录运行 `node scripts/prepare-kernel-candidate.mjs --verify-build .artifacts/review-alpha`。该命令核对固定提交、补丁树、工作区与暂存区的差异，并检查客户端构建记录中的 DSHU 版本、内核版本、上游提交、上游提交时间和候选树。临时传输提交即使包含完全相同的文件，也会使“基线提交”链接指向错误位置。Linux 实测遇到过这种情况。换机时应传输固定清单、补丁和还原脚本，在目标机重新还原。最后从实际应用打开关于页，核对链接指向清单中的上游提交。

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

在候选根目录执行 `pnpm run doc-sync`，同时检查配对、相对链接、包路径、配置和 API 目录、持久化历史及文档网站。接口类型的引用应落在仓库中的 `src/` 声明。修改记忆或余额的子路径后，应再运行 `pnpm run build`，以覆盖 Web 场景和 Host 的聚合类型检查。候选树 `6283464b` 的目录含 70 个根、709 个结构节点，其中包含正式版输入建议事件。此树的 43 项文档检查全部通过。

仓库根目录的同名 `doc-sync` 命令只检查公开 README 的长度与链接。另运行 `pnpm run verify-package-readme-summaries` 可检查 444 份包说明。主线的聊天、账号与额度两份中英文说明已重新配对。包摘要检查从 16 处降为 14 处，余项来自其他包的既有标题或字数问题。

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

### Windows 安装版的跨对话写作记忆

缺省与写作候选 `2026.11.25.0` 的 Windows x64 未签名 EXE 为 325,317,107 字节，SHA-256 为 `fa6fb6c35d2f0cc077717e5347a612202b881fe572008d6e417eb0167a0e518a`。配套 blockmap 为 336,641 字节，SHA-256 为 `60f8e9b665c94be3d7191577e8350e48edeed0bfecf364197534e4c4e6ea7d3c`。源码树为 `d75d00fb91e0eefa4bd271d874b28b25004a6685`，内核为 `0.2.3-alpha.2`。最终安装包应在同一套步骤中产生自己的回执。

**复验环境。** 在一次性 Windows 账号安装候选，使用一个测试工作区和独立 DSHU 资料目录。本次使用 `2026.11.24.3` 写出的印刷工作坊会话，记忆库初始为空。使用 Node 24.22.3 运行下面的本机测试服务。将打印的地址写入测试资料目录 `.env` 的 `DEEPSEEK_BASE_URL`，将 `DEEPSEEK_API_KEY` 设为 `offline-writing-fixture`，从安装好的桌面应用进入工作区。服务会从实际收到的 HTTP 请求中识别两种玻璃编号，返回确定的文本，并把编号是否出现、是否声明记忆工具写入 `provider.jsonl`。[本机记忆测试服务](../../kernel/0.2.3-alpha.2/verification/writing-memory-endpoint.mjs)

```powershell
New-Item -ItemType Directory initial
node kernel/0.2.3-alpha.2/verification/writing-memory-endpoint.mjs initial
```

| 操作 | 预期结果 |
| --- | --- |
| 1. 打开“设置 → 通用设置”。启用“跨对话记忆”，核对“自动提炼记忆”的初始状态，再单独启用它。在写作会话 A 发送 `STORE-QUAY. For this writing project, The North Quay lantern uses BRAMBLE-71 glass.` | 两个开关各自默认关闭。收到 `The writing note is ready.` 后，在“管理记忆”里能看到 North Quay lantern 和原句。随后关闭自动提炼，保留总开关开启。 |
| 2. 把新任务默认模式设为写作，在同一工作区新建会话 B，发送 `QUERY-QUAY-ONE. What glass does the North Quay lantern use?` | 回答为 `QUERY-QUAY-ONE BRAMBLE-71`。B 的用户问题中没有玻璃编号。会话日志记下这条记忆的 ID 和修订 1。 |
| 3. 在管理页编辑原记录，将内容改为 `The North Quay lantern uses COBALT-28 glass.`，保存。在 B 发送 `QUERY-QUAY-TWO. What glass does the North Quay lantern use now?` | 回答为 `QUERY-QUAY-TWO COBALT-28`。本轮注入同一 ID 的修订 2。B 的历史消息保留了先前的回答。 |
| 4. 关闭记忆总开关，新建写作会话 C，发送 `QUERY-QUAY-OFF. What glass does the North Quay lantern use?` | 回答为 `QUERY-QUAY-OFF NO MATCH`。本轮 HTTP 请求中没有两种编号和记忆工具声明。再次开启总开关，为冷启动保留已保存的记录。 |
| 5. 退出桌面和测试服务。用同一安装器和保留资料冷启动。另建空目录 `cold`，以上面的命令启动服务并传入 `cold`，将新地址写入测试配置。在管理页核对修订后的内容。新建写作会话 D，发送 `QUERY-QUAY-COLD. What glass does the North Quay lantern use?` | 总开关开启，自动提炼关闭。回答为 `QUERY-QUAY-COLD COBALT-28`。D 的 HTTP 请求中只有修订后的编号，整个冷启动阶段未产生提炼请求。 |
| 6. 在相同工作区把新任务默认模式改为缺省，另建会话 E，发送 `QUERY-QUAY-OTHER. What glass does the North Quay lantern use?` | 回答为 `QUERY-QUAY-OTHER NO MATCH`。请求没有两种编号，日志没有这条写作记忆。 |

**核对记录。** 退出桌面后，在一次性账号中运行以下命令。检查器同时读取记忆库、v4 会话（JSONL 或 zstd）和两次 HTTP 回执，核对五个会话、六个回合、原始提炼的请求与结果、作用域、每轮注入的修订号以及实际回答。此次安装实测得到记忆 ID `ad89c571-b02f-4cc0-bff3-0a8370f306cb`，冷启动读到修订 2。安装器与可重查的测试资料保存在 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-x64-candidate/d75d00fb91e0/`。真实模型选择、归纳哪些事实的质量仍需用实际模型评估。[安装版记忆记录检查器](../../kernel/0.2.3-alpha.2/verification/inspect-writing-memory.mjs)

```powershell
$fixtureProfile = Join-Path $env:USERPROFILE '.dsh-uncensored'
node kernel/0.2.3-alpha.2/verification/inspect-writing-memory.mjs $fixtureProfile initial/provider.jsonl cold/provider.jsonl
```

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

### Windows 安装版的余额历史与清理偏好

分别从上一正式版 `2026.11.24.3` 的 Windows x64 安装器开始。使用两个独立的临时账户，各带入一份写作工作区及旧版余额数据。一组旧配置未指定 `autoCleanup`，另一组显式设置为 `off`。两个账户均使用合成的 API Key 和仅在回环地址监听的余额服务。

| 操作 | 检查点 |
| --- | --- |
| 用旧版存储组件生成 513 条人民币采样，每两小时一条，跨度 42 天 16 小时。将数据源设为“本机记录”，启动旧版并打开额度页。 | 旧版曲线显示 240 个点，首尾时间正确。关闭应用后，旧版存储中仍有全部 513 条，金额保留 4 位小数。 |
| 用候选 EXE 的 `--updated /S` 原位升级。进入“设置 → 额度”，暂时使用本机记录。 | 新图可以检查全部 513 条。用键盘将两端各向内移一条，再用鼠标分别拖动两个把手。用 Home 和 End 读取区间首尾，对照原样本的时间戳。 |
| 依次选择侧栏短、中、长，最后关闭侧栏余额。检查旧设置对应的清理选项，再切到“API 实时”，出现新金额后切回“本机记录”。 | 默认组显示“按时间”和 30 天；显式停用组显示“关闭”。隐藏侧栏后设置图仍能查看。在下一次成功保存时按该账户自己的策略清理。 |
| 退出桌面并以同一用户冷启动，检查侧栏开关和已选范围。再次打开侧栏，观察短、中、长三档。 | 侧栏隐藏和长档选择可跨重启保存。显式停用组从工作区侧栏的实际曲线读取三档的首尾时间，分别符合距最新采样 24 小时、7 天、30 天的范围。 |
| 在“采样设置”分别试验手动和自动的按条数清理。 | 手动填 0 时提示 1–40320，填 1 合法。自动填 1 时提示 2–40320，填 2 后可保存。 |

**复验工具。** 关闭被测桌面，从一次性测试账户启动安装目录内的 `DeepSeek Harness Uncensored.exe`，为该进程设置 `ELECTRON_RUN_AS_NODE=1`。把[余额历史检查器](../../kernel/0.2.3-alpha.2/verification/installed-balance-history.mjs)的路径作为第一个参数，后续参数是操作、测试账户的 `.dsh-uncensored/storages` 绝对路径和原样本 JSON 的绝对路径。使用旧版可执行文件运行 `seed`，再用 `local` 验证原记录。升级采样、冷启动并关闭桌面后，使用新版可执行文件分别运行 `age` 或 `off`。检查器逐项比较原始金额、时间、币种和顺序，并单独核对新增样本。保留同一份原样本 JSON 供复查。

在临时资料的 `profiles/desktop/cordis.patch.yml` 内给 `balance` 设置 `baseURL: 'https://127.0.0.1:19343'`、`source: local` 和 `refreshSeconds: 3600`，为该资料配置 `DEEPSEEK_API_KEY=offline-balance-fixture`。显式停用组另填 `autoCleanup: 'off'`。准备含 IP 地址 `127.0.0.1` 的临时 TLS 证书和 PEM 私钥，向启动的测试桌面进程提供指向证书的 `NODE_EXTRA_CA_CERTS`。[回环余额服务](../../kernel/0.2.3-alpha.2/verification/balance-history-endpoint.mjs)可用下列命令启动。它对本次测试账户返回 CNY 余额 `987.654321`、赠送余额 `0`。正常启动桌面前清除进程的 `ELECTRON_RUN_AS_NODE` 设置。

```sh
node kernel/0.2.3-alpha.2/verification/balance-history-endpoint.mjs fixture.crt fixture.key
```

**安装回执。** 候选树 `6ec81d4b78a526c20a41a73030273289399c4bdf` 的未签名 Windows x64 EXE 为 325,354,069 字节，SHA-256 为 `68beb9db797725d423c2d4507946542f4a5b27a179ce4a4c47b162e1a4fbced8`。两次静默覆盖升级都返回 0，安装的 `app.asar` 摘要一致。两个账户在原始 513 条中分别用鼠标选中索引 124 至 388，读出的时间和原样本一致。两组各保存 2 条新采样。默认组冷启动后为 360 条旧采样加 2 条新采样，显式关闭组为 513 条旧采样加 2 条新采样。历史检查器逐条核对了两组的旧记录。[安装文件摘要与两组原始观测](../../kernel/0.2.3-alpha.2/verification/windows-balance-history-6ec81d4b.json)

安装文件及其 15,555 个块均已核验。本机交接目录为 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-x64-candidate/6ec81d4b78a5/`。其中 `verification/balance-history/{default,off}/` 保存了各自的样本 JSON、升级前后存储副本和桌面回执。可将同一安装器中的程序与 `cold-records`、`samples.json` 一起传给检查器重查结果。两份资料交叉使用 `age` 和 `off` 的错误预期时，检查器会报错。正式四模式安装包须从自己的安装文件重复这组升级操作。

### 插件列表与插件管理

上一正式版在设置内显示插件清单。新版 DSH 将插件管理移到独立页面，候选树 `d75d00fb91e0` 的 Host 提供清单接口，但客户端没有注册查看清单的标签。插件管理中的“已安装”列出可管理的插件包，一份插件包可以包含多个配置实例。核对两个视图的入口及内容时，分别选择一个随包组件和一个预设中的配置实例。

| 操作 | 验收结果 |
| --- | --- |
| 从中文的“设置 → 插件管理”打开插件页，也从侧栏的“插件”进入一次 | 两条入口都能打开“插件列表”。“已安装”仍可访问。工作区左侧全局面板没有插件“更多”启动按钮。 |
| 在“插件列表”搜索 `@deepseek-ai/dsh-client-ui-settings-plugin-inventory`，展开全局结果 | 显示完整模块名、稳定实例 ID、配置启用状态和运行状态。在桌面宽度及 390 像素窄屏分别用键盘或指针访问搜索框、查看详情。 |
| 清空搜索，查看会话插件，从当前预设切换到写作；再输入一个不存在的模块名 | 写作预设显示自己的配置实例，默认预设和已有会话的模式不受影响。无匹配时有明确提示，清空即可恢复。 |
| 在一次性资料副本中保留旧配置行 `ui-settings-plugin-inventory` 的显式 `disabled: true`，冷启动再从设置进入插件管理 | 插件管理仍可访问，清单标签依用户设置隐藏。复验使用独立账号或资料副本。 |

在还原并构建好的候选目录运行下列检查。组件用例覆盖加载失败重试、预设加载错误、本页模块重试、搜索状态和完整实例 ID。浏览器用例通过已组装的 Web Host 读取真实清单，核对桌面浅色与 390 像素深色布局、搜索框的可点击区域、实例展开、无匹配和写作预设切换。

```sh
pnpm exec vitest run --maxWorkers=2 packages/client/ui-settings-plugin-inventory/tests
pnpm run test:web:built apps/web/tests/entry-customization.e2e.ts --maxWorkers=1
```

在 Windows 安装版做对照时，用各自独立的临时账户安装同一架构的 EXE，打开同一份中文测试资料的副本。从账号菜单进入设置，上一正式版的分类名为“插件”，新版为“插件管理”。展开全局实例后核对“完整名称”“配置状态”和“运行状态”。另用一份资料副本，将下列内容写入用户目录下的 `.dsh-uncensored/profiles/desktop/cordis.patch.yml` 后冷启动。插件页应仍能打开“已安装”和“添加插件”，同时隐藏用户停用的“插件列表”。

```yaml
- id: ui-settings-plugin-inventory
  name: '@deepseek-ai/dsh-client-ui-settings-plugin-inventory'
  disabled: true
```

2026 年 11 月 26 日在断网 Windows x64 沙盒用中文界面完成下列对照。每次先核对 EXE 摘要，再静默安装、核对登记版本并启动桌面。四次使用各自的测试资料副本。[安装文件、对照结果与截图摘要](../../kernel/0.2.3-alpha.2/verification/windows-plugin-inventory-6ecb056c.json)

| 安装文件和配置 | 从桌面看到的结果 |
| --- | --- |
| 正式版 `2026.11.24.3` | 设置中能搜索并查看全局清单插件本身。 |
| 树 `d75d00fb91e0`，默认配置 | 插件页显示“添加插件”，缺少“插件列表”。仅检查插件管理页能打开会遗漏这一回归。 |
| 树 `6ecb056c6cc5`，默认配置 | 全局实例显示完整模块名、“已启用”和“运行中”。切换到写作预设后渲染出 6 个插件实例。打开关于页，左侧显示 DSHU `2026.11.25.0`、作者与编译时间，右侧显示 DSH `0.2.3-alpha.2`、两份许可和源码信息。 |
| 同一 EXE，使用上面的停用配置 | 插件管理及“添加插件”可打开，“插件列表”按旧设置隐藏。两个沙盒安装后的 `resources/app.asar` 摘要一致。 |

本机安装文件与截图保存在 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-x64-candidate/6ecb056c6cc5/`。EXE 为 325,353,923 字节，SHA-256 为 `f80e40181935e66c44178e04ce221de9599597d78fece6d1b7ddb58298f01864`。差分索引的 15,524 个块已逐块与 EXE 核对。此未签名包覆盖缺省和写作。合并后还须对拟发行安装包及各自实际包含的模式重复本节操作。

### 关于页与模式设置的候选验收

关于页布局首次在候选树 `9a040762398793a9e8e29c8c2c243f167e9fda04` 验收。从账号菜单打开关于页，登录前后都能使用。桌面左侧的渐变贴齐弹窗上、下、左三边，窄屏改为顶部横幅。弹窗通过辅助技术名称标识，右上角关闭按钮固定可达。桌面用 Escape 关闭后，焦点回到账号菜单，可以直接按 Enter 再次打开。下列中文实拍来自 Fedora 上的候选树 `48ba9a1a8695`，分别使用 1280 像素和 390 像素宽的视口。[候选桌面实拍](../../docs/assets/dshu/about-candidate.webp) · [候选窄屏实拍](../../docs/assets/dshu/about-candidate-mobile.webp)

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

主线的 `dynamic-tool-updates` 无密钥回放在 Windows 上多读到主机自带的 ACL 诊断技能提示，与已提交的跨平台记录相差一条事件。新版候选树 `48ba9a1a8695` 已在 Fedora 45 x86_64 的独立用户目录运行 `pnpm run test:snapshot -t dynamic-tool-updates`。Headless 和 SDK 两条回放均通过，覆盖合成工具 `snapshot_ping` 的加入、一次调用、移除，以及会话记录与 SDK 通知的一致性。旧主线在标准环境的结果仍待单独核对。

| 发行前验收 | 通过条件 |
| --- | --- |
| 在原会话自救 | 用户可在宿主设置停用对应服务并保存，再向原会话发送普通消息。REA 总开关影响使用该配置的会话。只在一个会话中单独停用被点名的工具、保留同一服务的其他工具，并以桌面账号登录复验，仍待完成。 |
| 各路由的最终请求 | 首次声明、已有坏历史、重连和不同工具更新模式分别检查。停用后，请求中没有导致拒绝的声明或无效引用，保留已执行调用及其结果。记录实际发送的工具集合，以便回放。 |
| 识别与错误提示 | 对被明确点名且确实随请求发送的工具显示来源和停用入口。模糊 400、权限不足、限流和断线分别呈现。自动重试如有实现，最多一次，且不重复执行工具。工具的本地输入校验继续生效。 |
| 跨供应商与嵌套字段 | 检查根及嵌套属性、数组项、组合与引用定义。按实际供应商结果处理表达式。再测两个有问题的工具、同名工具更换 schema、插件重启及并发窗口，核对停用归属。 |
| 相邻报告 | [#22](https://github.com/Water-Run/deepseek-harness-uncensored/issues/22) 验证工具发现。[#23](https://github.com/Water-Run/deepseek-harness-uncensored/issues/23) 单独验证缓存，固定供应商、模型、消息前缀及工具顺序，比较未变、更改和停用工具三种情况下的请求声明及供应商缓存读数。供应商不报告缓存用量时标为未知。切勿由单次 400 推断缓存失效或改为全量注册。 |

### 点名拒绝后的恢复与缓存排查

主线和内核候选从已记录的错误读取工具名。HTTP 400、`INVALID_REQUEST` 和供应商的具名 schema 诊断须同时匹配。会话只标记已声明且被点名的工具，停用后才排除其声明与启停引用。连续点名不同工具时分别保留记录。如果会话从未声明过该名称，保留原请求历史。没有点名的旧错误继续沿用旧会话恢复行为。[错误解析](../../packages/llm/llm/src/schema-error.ts) · [会话投影](../../packages/core/session/src/tool-history.ts)

| 复验入口 | 操作与通过条件 |
| --- | --- |
| 会话与 HTTP | 运行下列第一行。笔记查询连续两次被拒绝，停用后原会话连续两次成功。API Key 和测试账号分别检查请求。恢复请求里的时钟、无关的笔记列表声明、声明顺序、原移除消息和用户文字均须保留。认证失败、429 和未知工具名单独对照。 |
| 用户可见的旧会话 | 先完成构建，再运行第二行。浏览器从 v4 日志重新打开旧会话，在 1280 和 390 像素宽度以键盘展开和收起指引。错误原文保留，提示说明关闭共享服务的影响。复验只用虚构的笔记工具。 |
| 产物和安装器 | 在还原的候选根目录执行上文的 `mcp-schema-probe.mjs`。同一脚本也支持已安装的 Electron。除三条普通恢复结果外，具名拒绝场景须输出 `named-rejection`，并保留 `clock`、`mcp__notes__list`。 |
| 第三方缓存 | 回环对照已确认请求保留了无关工具声明。报告所用第三方服务的实际缓存用量未知，本轮验收未测量其命中率。[Issue #23](https://github.com/Water-Run/deepseek-harness-uncensored/issues/23) |

```sh
pnpm exec vitest run packages/core/session/tests/tool-history.spec.ts packages/llm/llm-deepseek/tests/adapter.spec.ts packages/client/ui-chat/tests/chat-view.client.spec.tsx packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts
pnpm run test:web:built apps/web/tests/mcp-schema-recovery.e2e.ts
```

在候选 `971ebe0266acd923d40b57265c6d4c5575e38939` 上使用官方 API Key 复验，带坏声明的原请求返回 400 并点名笔记工具。停用后，同一个会话返回 200，答出先前的标签 `ORCHID`。这一次响应报告 `input_tokens=135`、`cache_read_input_tokens=128`、`cache_creation_input_tokens=0`。探针保留供应商给出的零值，缺失字段输出 `null`。这组数字仅对应这一次官方请求。复核第三方报告时取同一供应商的原始响应，特别注意会话统计显示的是多次请求的累计值。[复验脚本](../../kernel/0.2.3-alpha.2/verification/mcp-schema-probe.mjs)

`2026.11.23.0` 和 `2026.11.24.3` 各自在独立目录写入 28 份资料，候选 `971ebe02` 继续原对话并冷重启，全部原件 SHA-256 保持一致。后续在新目录从冻结锁文件离线安装，补齐额度设置包的侧栏和支出类型协议两项开发依赖。主线 100 个包、候选 105 个包通过发布依赖检查。候选 `5a851855e0f1ad3086f965d3412a4e4ca2a4cc31` 还更新了账户授权测试。账户和额度的读权限可以分别撤销，账户菜单和登录入口共享账户操作。35 份测试共 767 项通过，覆盖额度设置、会话、请求及聊天界面。[候选源码身份](../../kernel/0.2.3-alpha.2/source.json)

当前错误提示说明共享服务的停用办法，用户保存设置后自行重发。后续验收单会话停用时，准备两条使用同一服务的会话。在第一条执行停用，既要检查发出的声明，也要检查该会话对工具的调用资格。第二条应能继续使用同一工具，第一条在重开后仍保持停用。现有 `ToolsService.restrict` 只筛选继承的工具，本地注册项也必须接受同一停用决定。验收使用合成工具即可，无需运行第三方引擎。

**仓库检查。** 上述四份测试在主线通过 351 项，在新版内核通过 366 项。两份源码都已用真实 Chromium 重放 v4 会话。主线 `pnpm run hygiene` 另报六项既有失败，在修复前的提交 `3b08af3080` 上分别重跑也能复现。发行前需核对产品包分类、客户端插槽目录、插件语言元数据、Cordis 配置解析、Session 校验中的类型断言和插件入口导出。复验命令分别是 `pnpm run verify-product-use`、`pnpm run verify-client-catalog`、`pnpm run verify-locale-metadata`、`pnpm run verify-cordis-config`、`pnpm run verify-no-unknown-casts` 和 `pnpm run verify-plugin-entry-exports`。

## Issue 26 的 Windows 静置卡死

**发行阻断，根因待定位。** 报告者在 Windows 11 x64 安装版 `2026.11.24.3` 上观察到，无操作时渲染进程内存、句柄和本地 Host 的已建立连接持续上涨。报告包括启用及停用第三方插件的两组采样。打开旁问会加速故障，未打开旁问时也出现。重装后仍复现。上述是用户提供的观测，此处没有该设备的进程跟踪。[Issue #26](https://github.com/Water-Run/deepseek-harness-uncensored/issues/26)

报告者于 2026-11-25 22:02（北京时间）自行关闭了 Issue，时间线中没有补充原因、修复版本或复验结果。发行清单保留这项独立验收。[GitHub 时间线](https://api.github.com/repos/Water-Run/deepseek-harness-uncensored/issues/26/timeline)

主线排查中修复了一处可以独立验证的重复请求。同一父会话的两个旁问订阅同时进入时，现在只发起一次 Host 打开请求及一次会话刷新，各自保留和释放自己的引用。组合用例覆盖同时打开、重设上下文、重开及关闭，连同随问控制器共 13 项通过。另有连接重建、资源订阅、桌面转发三组 66 项测试通过。上述证据覆盖旁问并发路径；启动后没有打开旁问时的整机增长仍待查明。

**输入框重复请求。** 草稿没有改变时，界面重新绑定回调曾再次启动 800 毫秒定时器。针对同一草稿和一次重新绑定的回归用例，在修复前观测到两次预测请求，修复后为一次，已有建议仍可采纳。修改草稿、关闭开关或卸载输入框仍会取消旧请求。主线及新内核都已覆盖此例。该缺陷需要一个可预测的输入框，不能独自解释报告中程序启动后每秒出现数百个本机连接的现象。

**原版安装器对照。** 从 GitHub 正式发行版取 Windows x64 安装包 `2026.11.24.3`，文件 SHA-256 为 `a84001b8ec3d64ae4452833d8fdd018857900a772be366488de2f219334b5b30`。在两次独立的 Windows Sandbox 10.0.26100 x64 启动中，网络适配器均已启用，首次启动前均没有 DSHU 资料目录。以普通安装后的入口启动，无调试器，未操作窗口。每次从进程启动开始静置三分钟，各取 13 个样本。报告者使用的是 Windows 11 Build 26300，并曾使用过旧版。两次沙盒实测均未出现报告中的持续增长。[原版安装包](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.24.3) · [第二次实测的逐进程原始数据](../../kernel/0.2.3-alpha.2/verification/windows-idle-v2026.11.24.3.json)

| 原版实测 | 约 15 秒、30 秒、180 秒的进程树专用内存 | 约 15 秒、180 秒的进程树句柄 | 连接观测 |
| --- | --- | --- | --- |
| 第一次启动 | 671.1、667.1、532.5 MiB | 2,766 → 2,756 | 在同一快照中能按监听端口归属的客户端连接为 0 至 4 条。 |
| 第二次启动 | 663.5、665.1、534.9 MiB | 2,746 → 2,740 | 进程树内所有已建立的回环 TCP 端点最多 9 个。180 秒时仍有 6 个端点，其中按监听端口统计的客户端连接为 0。 |

采样脚本的 `establishedClients` 统计连接到同一快照中本进程树监听端口的客户端。监听端口未被观测到时，该值可以为零。`loopbackEstablishedEndpoints` 独立记录所有属于进程树的已建立回环端点，并按 PID 拆分。一条连接的两端如果都属于进程树，会计两次。脚本识别通配监听地址、IPv4 回环网段和 IPv4 映射的 IPv6 地址。以上两次使用空资料，均未操作旁问。

**Windows 空资料实测。** 在 Windows Sandbox 10.0.26100 x64 的两个独立账户安装缺省与写作候选 `2026.11.25.0`，安装器 SHA-256 为 `ad437c3bf544e68771ff74c42b65a8488c773d1118cc3052a99cc130b11ad15c`。第一组启动后无操作，第二组选择 API Key、跳过配置并进入工作区外壳。每组七次采样，统计主进程及其子进程的专用内存、句柄和本机已建立的 TCP 连接。连接按客户端到同一进程树监听端口的方向计数。

| 隔离环境禁用网络适配器 | 采样时段 | 进程树专用内存 | 进程树句柄 | 本机连接 |
| --- | --- | --- | --- | --- |
| 启动后无操作 | 9.0 至 95.1 秒 | 712.7 → 514.2 MiB | 4,462 → 3,083 | 各次为 0 或 1 |
| 跳过欢迎页后静置 | 11.1 至 95.2 秒 | 668.6 → 511.0 MiB | 2,711 → 2,705 | 各次均为 0 |

第二组工作区出现“连接异常，刷新重试”。旧连接逻辑在系统离线时也暂停了桌面到本机 Host 的连接。主线和新内核现已让自带本机 Host 的客户端在系统断网时继续连接，访问远程 Host 的网页仍会暂停重试。同一项回归在修改前停在 `disconnected`，修改后两条源码线分别通过 58 项连接测试。以上两个旧候选样本均未显示报告中的增长，但第二组没有建立工作区连接。保留旧会话和旁问的后续结果见下文，最终四模式包仍须独立验收。

**修复后的安装包。** 在新的 Windows x64 沙盒中全新安装候选树 `4d8c520d76bf28f23e4a202f57e5d0ea97d4e2a9` 的未签名 EXE。禁用虚拟网络适配器，跳过 API Key 配置，确认页面报告 `navigator.onLine === false` 且桌面传输拥有本机 Host。默认工作区正常出现，从账号菜单打开关于页并核对 DSHU `2026.11.25.0`、DSH `0.2.3-alpha.2`、候选树及检查更新按钮，然后关闭弹窗并断开界面自动化连接。下表是此后使用仓库采样脚本得到的完整序列。所有七次均有 3 条已建立的本机客户端连接。

| 距开始秒数 | 3.6 | 15.2 | 30.1 | 45.1 | 60.1 | 75.1 | 90.1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 进程树专用内存（MiB） | 696.4 | 697.0 | 552.0 | 552.1 | 543.2 | 540.9 | 539.4 |
| 进程树句柄 | 2,753 | 2,743 | 2,745 | 2,745 | 2,738 | 2,738 | 2,735 |

EXE 为 325,300,939 字节，SHA-256 `fc81c3d72b4fb8a317a1b8938a99ad512c5679427495c1e78e268924a4cbd721`。配套 blockmap 为 337,682 字节，SHA-256 `bdd6d243769150f99d7a2ef98f787bb4e28584684db5ee9e9567939fd864559f`。本机交接目录为 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-x64-candidate/4d8c520d76bf/`，含安装文件、摘要、界面截图和逐进程采样。此前两个独立对照样本在 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-idle/previous-ad437c3bf544/`。这组验证时长为 90 秒，使用空资料及缺省、写作两种模式。

这一份安装器还分别从 `2026.11.23.0`、`2026.11.24.3` 完成保留资料的静默覆盖升级及同版重装，两项退出码均为 0。两台沙盒分别拒绝降级和无效的旧版登记，退出码均为 2。安装后的 `app.asar` SHA-256 同为 `251dd0133f5defc4c7c61abc7e2c778a0c8287d9ef5ccc3fa23e2a6c6e1e25ac`。含输入建议的原会话可继续、冷启动可重开；#25 的具名工具错误恢复在该安装目录复验通过。完整回执是交接目录中的 `first-upgrade.json`、`previous-upgrade.json`。[首发版升级问题](#issue-24-的首发版静默升级) · [会话恢复问题](#issue-25-的工具声明与会话恢复)

### 保留旧写作会话的 Windows 安装包对照

原版使用报告中的 `2026.11.24.3` 安装器。候选从同一安装器以 `--updated /S` 原位升级到 `2026.11.25.0`。两次使用独立的 Windows Sandbox 10.0.26100 x64、6 GiB 内存和已启用的网络适配器，跳过密钥配置，未安装第三方插件。两个账户都在首次启动应用前装入同一份合成资料，安装及复制后逐一核对三份文件的 SHA-256。进入工作区后按顺序加载主会话末条回复、显示旁问末条回复、关闭旁问页签。

候选树为 `b738adb9fcf1e7d16c1857aaf8a5cb8706a64e53`。Windows x64 未签名安装器为 325,314,921 字节，SHA-256 `11b18e03c66142bc14b1920f808f02827cfd9fd9e1de7cd85e517cd98ed02f96`。配套 blockmap 为 336,444 字节，SHA-256 `982aa3d859c7c90e6ec3dcdcfe401fad03e58b15d6a29acb66deb5f249d55ae7`。安装后的 `app.asar` SHA-256 为 `090b0b768e5f43954155e98c3efc3945c0fed99f2c39c290031efe3fa25bc1f9`。

| 已安装版本 | 观察页面 | 进程树专用内存（首末，MiB） | 句柄（首末） | 回环端点（最少–最多） | 去重连接（最少–最多） |
| --- | --- | --- | --- | --- | --- |
| 上一正式版 | 主会话 | 764.5 → 585.3 | 2,782 → 2,785 | 7–10 | 此阶段未采集 |
| 上一正式版 | 旁问已打开 | 582.8 → 554.1 | 2,381 → 2,383 | 6–10 | 单次补测为 4 |
| 上一正式版 | 旁问已关闭 | 561.3 → 557.1 | 2,385 → 2,385 | 6–8 | 4 |
| 两模式候选 | 主会话 | 723.6 → 544.1 | 2,794 → 2,801 | 5–7 | 3–4 |
| 两模式候选 | 旁问已打开 | 539.1 → 507.7 | 2,395 → 2,409 | 5–8 | 3–4 |
| 两模式候选 | 旁问已关闭 | 519.6 → 518.4 | 2,410 → 2,394 | 5 | 3 |

每个版本在同一进程上连续观察三个阶段，每阶段 3 分钟、13 个样本，共 78 个样本。两个应用在最后一次采样结束后均能继续显示主会话。两组均未观察到报告所述的持续增长。回执保留三份输入文件的摘要、每个 PID 的角色、专用内存、句柄和回环端点序列，以及每阶段有变动的日志。[逐进程采样和旧资料摘要](../../kernel/0.2.3-alpha.2/verification/windows-retained-idle-b738adb9.json)

两版打开旁问后都在其日志追加了一次空草稿预测请求和一条失败结果。对照采样前后的文件摘要并逐条解压，原来的记录均保留。两次都跳过了账号配置，历史中的翻译插件记录也没有对应的运行中插件。报告者在故障期间观察到会话文件完全没有写入，设备为 Windows 11 家庭版 Build 26300。要确认该故障，应在相应系统和资料条件下保留资源增长时的进程树及连接归属。

最后一组采样结束后，用已安装候选的账号菜单打开关于页。深色品牌区贴齐弹窗左边和上边，左侧为 DSHU `2026.11.25.0`，右侧为 DSH `0.2.3-alpha.2`、候选树和两项发行版组件参考。按 Esc 能关闭。设置页的四种外观均可见，默认选中日出日落。跨对话记忆默认关闭，额度页的自动清理已启用并保留 30 天，模式页可见写作。安装器、blockmap、原始逐进程 JSON 和各页截图位于 `%USERPROFILE%/DSHU-Deliveries/20261125/windows-x64-candidate/b738adb9fcf1/`。

同一安装器另用两个离线账户复验了 #24 和 #25。分别从 `2026.11.23.0` 和 `2026.11.24.3` 静默原位升级，两个起点的安装和同版重装退出码均为 0。模拟降级及无效登记均返回 2，原程序和资源摘要保持一致。每组都用安装后的程序续写并重开带输入建议的旧会话，核对三种历史工具声明以及服务商点名拒绝一个工具后保留的无关声明。两份回执位于同一交接目录的 `first-upgrade.json`、`previous-upgrade.json`。正式签名安装器的真实线上升级仍待验证。

### 用上一正式版生成可重复使用的旧资料

在一次性 Windows 测试账户安装 `2026.11.24.3`。从仓库根目录运行以下 PowerShell。脚本调用安装目录里的写作会话、工作区和压缩存储实现，重新读取落盘的两条会话，并核对消息。它会新建输出目录，遇到同名目录立即退出。[写入器](../../kernel/0.2.3-alpha.2/verification/windows-retained-writing.mjs) · [输入建议样本](../../packages/sdk/client/tests/expected/input-prediction-projection.json)

```powershell
$install = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
    Where-Object DisplayName -Like 'DeepSeek Harness Uncensored*'
$desktop = Join-Path $install.InstallLocation 'DeepSeek Harness Uncensored.exe'
$writer = (Resolve-Path 'kernel/0.2.3-alpha.2/verification/windows-retained-writing.mjs').Path
$prediction = (Resolve-Path 'packages/sdk/client/tests/expected/input-prediction-projection.json').Path
$fixture = Join-Path $env:TEMP ('dshu-retained-' + [guid]::NewGuid())
$env:ELECTRON_RUN_AS_NODE = '1'
try {
    & $desktop --expose-internals $writer $fixture 'C:\DSHU-workshop' $prediction | Out-Host
    if ($LASTEXITCODE -ne 0) { throw '旧版未成功生成测试资料' }
} finally { Remove-Item Env:ELECTRON_RUN_AS_NODE }
```

主会话包含 45 次写作问答、218 条输入建议事件、952 条合成的翻译插件历史和 782 条印刷批注。主日志共 2,224 条事件，连同文件头解压为 7,268,008 字节。旁问的 7 条事件连同文件头为 1,298 字节。均使用虚构文本，翻译记录只保存在历史中。每次新建资料时消息标识和时间会变化，比较两个安装包时应复用同一次生成的文件。

1. 保留上述目录作为原件。在两个新测试账户中建立相同路径 `C:\DSHU-workshop`，把原件各复制一份到首次启动前的 `%USERPROFILE%\.dsh-uncensored`。记录 `storages/workspace.json` 及两份 `session.v4.jsonl.zstd` 的 SHA-256。
2. 在第一个账户使用上一正式版。在第二个账户先安装同一正式版，再以 `--updated /S` 从同一目录覆盖升级。核对产品版本、安装器摘要和三份旧文件的摘要。两次测试分别运行，使用相同的网络和插件配置。
3. 在工作区 `Retained print workshop` 打开旧主会话，等到末条回复 `Proof 45 is ready for the binder.` 可见。记录第一组。打开旁问，等到 `Use cotton paper for the cover.` 可见，记录第二组。关闭旁问页签，确认主会话仍能操作，记录第三组。
4. 每组开始前断开界面自动化连接，保持应用运行。每 15 秒读取同一进程树一次，含起始样本共 13 次。每组静置前后比较两条会话日志的文件摘要。记录操作系统、网络状态、是否加载第三方插件及认证方式，以便与故障设备对照。

新版采样器同时给出 `loopbackEstablishedConnections`，将本地和对端的地址、端口规范化，同一 TCP 连接的两个方向只计一次。一端属于进程树即可纳入，两个方向都在树外则排除。即使当前 Windows TCP 快照未列出监听端口，这个指标也可用。原版实测期间有一次 `netstat` 列出了 4 条连接的 8 个端点，同时按监听端口只能识别 0 条客户端连接。早期回执没有独立连接数字段，应保留其原始端点计数。

从任务管理器选取这次启动的 DSHU 主进程 PID，在仓库根目录运行下列命令，将示例 PID 和输出文件名替换为实际值。[Windows 采样脚本](../../kernel/0.2.3-alpha.2/verification/windows-idle-samples.ps1)只读取进程和系统 TCP 表。结果包含每次采样的 UTC 时间、角色、内存、句柄和监听端口。填写工作区结果前先确认应用已加载工作区。

```powershell
.\kernel\0.2.3-alpha.2\verification\windows-idle-samples.ps1 -RootProcessId 1234 -SampleCount 13 -IntervalSeconds 15 |
    Set-Content -Encoding utf8 workspace-idle.json
```

- [x] Windows Build 26100 在两个独立账户上对照上一正式版和两模式候选，使用同一份保留资料，分别测量重开旧会话、打开旁问及关闭旁问。
- [ ] Windows 平台维护者使用最终候选复验欢迎页和上述三个阶段，优先对照报告中的 Build 26300、已有资料、账号和插件配置。保留起止时间、应用版本及同一进程树的内存、句柄、回环端点和独立连接数。
- [ ] 按页面和请求类别区分持续订阅、普通 RPC 和重新连接，核对窗口关闭、Host 重新启动及应用退出后资源是否释放。现有通用连接控制器含重连退避，旁问资源生成器在两次更新间等待通知。仅凭报告中的循环或某一次连接的快照无法确定故障源。
- [ ] 将证实的根因和对应的资源所有者记录在本节，为修复补充可重复的回归检查。使用新资料与保留资料各做一次实装复验，同时检查正常的重连和旁问功能。重装成功或一张低内存截图均不足以关闭该问题。

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

### 含输入建议的旧会话

**触发条件。** 正式版输入框曾为草稿请求过建议，即使用户没有采纳，压缩的 v4 日志也会记录 `input/prediction`。在树 `5a851855` 上，`2026.11.23.0` 写出的会话在打开时抛出 `SessionFormatUnsupportedError`，错误指向日志中第一个输入建议事件。旧候选 Windows 桌面载荷也复现了相同错误。此前的资料样本只写入已提交的用户输入，因此漏过了后台输入建议。这是独立复现的兼容性问题，#20 报告者的原始日志未参与测试。

**读取行为。** 候选树 `6283464b1d8b902a9f3813a1f223e147a367e24c` 按原序号保留建议的请求与结果，包含当时的草稿、建议内容、供应商返回的用量和各条记录的时间。缺少请求标识和用量的旧记录也能续写。只有实际提交的输入进入后续对话。运行时仍拒绝其他未知必读事件。两个正式标签各自登记的 66 种事件中，当前候选能识别 65 种，余下的 `target/admission` 仍待独立验收。

**检查整个已发布事件表。** 在资料验证命令的末尾用 `--check-event-types` 替代 Electron 路径，可直接比较两个实际读取器登记的所有事件名。存在缺项时会列出名称并返回 1。常规资料验证也会打印同一清单，然后继续跑样本。完整发行应对两个正式标签各运行一次清单检查，并保留样本回放来核对同名事件的字段和含义。

**复验。** 分别对上表的两个正式标签运行资料验证器，将目标树和 Electron 可执行文件作为后两个参数。旧端调用已发布的输入建议写入器，测试流返回建议和用量，随后将普通会话写成压缩 v4 文件。候选从副本打开，在同一会话续写一轮，关闭后另启进程再读。两条输入建议事件须与旧端记录逐字段相同，对话中须只看到先后提交的两条消息。两个标签分别通过 Electron 44.11.5 的读取、重开及桌面 Host 检查，每组 30 个原始样本文件的 SHA-256 均一致。还原候选中的 `docs/persistence-changes/2026-11-25-released-composer-predictions.zh.md` 记录 v4 的读取决定。[跨版本资料用例](../../kernel/0.2.3-alpha.2/verification/released-data.spec.ts.in)

**安装验收。** 在独立 Windows Sandbox 中，将旧版及候选安装器与 [Windows 升级脚本](../../kernel/0.2.3-alpha.2/verification/windows-installer-upgrade.ps1)、[安装后会话检查](../../kernel/0.2.3-alpha.2/verification/installed-composer-session.mjs) 一同放入只读输入目录。用 `-ComposerSample` 传入[已发布的输入建议样本](../../packages/sdk/client/tests/expected/input-prediction-projection.json)。旧版安装后用随包的 JSONL 服务写入该样本。升级后用实际安装的 Electron 打开并续写，同版重装后重新读取。每个起始版本的回执须同时包含 `Composer` 的 `write`、`continue`、`reopen` 三项及安装器摘要。日期版本相同的候选可通过安装器摘要或内嵌源码树区分。

| Windows x64 缺省与写作候选 | 实装结果 |
| --- | --- |
| 安装器 | DSHU `2026.11.25.0`，DSH `0.2.3-alpha.2`，未签名。325,272,813 字节，SHA-256 `ad437c3bf544e68771ff74c42b65a8488c773d1118cc3052a99cc130b11ad15c`。 |
| 差分索引 | 338,016 字节，SHA-256 `fa8957778b655551489834cfffc489f6e478dddafa03d90670155a53b8819f4d`。15,543 个分块已逐块重算。 |
| 首发版升级 | 从 `2026.11.23.0` 静默升级返回 0。候选打开首发版写入的会话并续写，再次同版安装返回 0，冷启动可读回两条输入及原始建议记录。降级、无效版本登记均返回 2。 |
| 上一正式版升级 | 从 `2026.11.24.3` 在另一台沙盒完成相同流程，四次安装退出码依次为升级 0、降级 2、无效登记 2、同版安装 0。旧候选 `ccf4f669…` 在同一起点的对照中能升级，随后读取建议时报 `SessionFormatUnsupportedError`。 |
| 安装内容 | 两次安装的 `resources/app.asar` 摘要均为 `973cc4b4cad699b932079a5624de8c6e6c1c27905180734798ef76b00bf95a7b`。两处都通过了 #25 的三种普通投影和具名工具拒绝后续写的回归。 |

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

最新 Windows 两模式候选已从首发版和上一正式版分别验证静默升级。[本次安装器摘要及两组回执](#保留旧写作会话的-windows-安装包对照)

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

#### 具名工具拒绝修复的 Windows 实装验收

[当前 Windows 候选的两组安装回执](#保留旧写作会话的-windows-安装包对照)也覆盖本节的旧会话恢复和具名工具拒绝。

缺省与写作的未签名 Windows x64 候选来自 [源码里程碑 `d4654e563a`](https://github.com/Water-Run/deepseek-harness-uncensored/commit/d4654e563a9c681d5f09ee14e0e0606cad867801)。安装后的资源内嵌候选树 `5a851855e0f1ad3086f965d3412a4e4ca2a4cc31`。以下摘要标识这一份安装器。

| 对象 | 验收结果 |
| --- | --- |
| Windows EXE | 325,251,829 字节，SHA-256 `ccf4f6692fd6482e70f7345691daea4df638f0aae0089c30a215b3074ee013a6` |
| 差分索引 | 336,702 字节，SHA-256 `44f92e0dbd3823e3cbfe36bcc98272fccea4795a65a2eff081630bbc0f36c089`。逐块重算 15,506 项均一致。 |
| 两台沙盒安装后的 `resources/app.asar` | SHA-256 均为 `931b2e8c8fbf8d4c719769839b91061d9acc99ffb3170450cd2131772687c6d2` |
| 从 `2026.11.23.0` 和 `2026.11.24.3` 升级 | 各用一台离线 Windows Sandbox。原目录内静默升级与同版重装分别返回 0，降级与无效版本登记分别返回 2。两处安装均识别 DSHU `2026.11.25.0`、DSH `0.2.3-alpha.2` 和许可信息。 |
| 安装后恢复原对话 | 两处均以安装后的 Electron 运行探针。三种普通投影均能排除已停用工具。具名拒绝单独覆盖：笔记查询从请求中移除，原用户消息、时钟、已停用的笔记列表声明及其正常移除记录保留。 |

验证正式更新时，分别从首发版和上一正式版的原始安装登记开始，通过线上更新渠道下载同一签名候选。记录实际安装器摘要、退出码、原路径、更新前后登记版本及 `resources/app.asar` 摘要，并检查旧资料。上表的本地安装验收未覆盖线上下载和签名。

## Linux 候选的原生构建

使用仓库根目录的 `node scripts/prepare-kernel-candidate.mjs <新目录>` 还原缺省与写作候选。命令最后一行应与 `kernel/0.2.3-alpha.2/source.json` 的 `tree` 字段一致。以下命令在还原后的目录执行。Fedora 45 x86_64 实机使用 Node 24.22.3、pnpm 11.28.5 和安装在用户构建目录的 musl 1.2.6。

| 步骤 | 操作与结果判定 |
| --- | --- |
| 构建准备 | 运行 `pnpm install --frozen-lockfile`。同架构 Linux 主机需要 cc、musl-gcc。x64 回读 RPM 还需要 rpm 和 rpm2cpio。 |
| 工具链预检 | 运行 `pnpm run package:desktop:linux:x64:unsigned --check`。预检实际链接一个静态程序和一个共享对象。arm64 主机将命令中的 `x64` 换为 `arm64`。 |
| 生成安装包 | 去掉 `--check` 重跑命令。在 `apps/desktop/.desktop-build/packaging-runs/` 查看运行日志。成功后，到 `apps/desktop/.desktop-build/targets/<目标>/unsigned-artifacts/` 读取文件。 |
| 归档核验 | x64 生成 deb、rpm 和 tar.gz。arm64 生成 deb 和 tar.gz。打包入口从各归档回读桌面程序、`resources/app.asar`、CLI 启动器和独立 Node，逐项对照组装目录核验 SHA-256，并检查三个可执行文件的权限。随后验证 ASAR 索引和运行时清单、PNG 往返、终端、Office 和后台启动。 |
| 安装升级 | deb 与 rpm 分别在匹配架构的测试系统验证安装、桌面启动和保留资料升级。记录旧版与候选安装包摘要、包管理器读取的版本，并从已安装的应用重开旧会话。 |

Fedora 的首次干净构建在 Host Typert 阶段报错。跨对话记忆的抽取模块引用了新版内核已撤下的 `@deepseek-ai/dsh-llm/brand` 子路径。改从公开的 `@deepseek-ai/dsh-llm/types` 导入相同类型后，Fedora 从源码通过全部 10 个构建检查。重新生成持久化目录仅更新源码位置，70 个根和 709 个结构节点的内容均一致。

在后续 PNG 检查中，Linux Electron 以 Node 模式执行 sharp 0.35.5 时收到 SIGSEGV。在同一台机器上，随包 Node 24.22.3 将 RGB 像素编码成 PNG 后解码，输出字节与输入一致。Linux 后台与 CLI 因此使用这份独立 Node，从 `resources/app.asar.unpacked/dsh` 读取程序包。桌面界面由 Electron 运行。打包前和组装后的冒烟测试均沿用真实的后台解释器。[sharp 的 Linux Electron 兼容性说明](https://sharp.pixelplumbing.com/install/#electron-and-linux)

候选树 `2aad09492786a034c10bae38c1513355e7e56e1b` 的 Fedora x64 运行时已通过 PNG 编解码、PTY 收发、文件搜索、使用随包 pnpm 离线安装与移除插件、启动后台，以及 DOCX、XLSX、PPTX 转 PDF、图像渲染与表格重算。可在专属验证目录 `~/.local/state/dshu-verification/alpha-20261125-4799b8b259b2/` 中查看 `prepared-runtime-2aad094927.log`。这个目录按首次构建命名，复验源码以日志对应的树为准。Windows 端还原补丁后得到相同 Git 树，候选的 10 项构建检查、43 项文档检查均通过。已有 Windows 实装证据对应的安装器见前文。

同一树组装后的 CLI 启动失败。electron-builder 按应用目录下的**输入路径**匹配 `asarUnpack`，直接写归档内的目标路径会将后台入口留在 ASAR 内。独立 Node 因此找不到 `app.asar.unpacked/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js`。该树生成的 Linux 包不具备交付资格。后继源码使用构建器自己的匹配器回归检查桌面主程序、后台清单和 CLI 三个位置，并在 `afterPack` 从组装目录读取和校验完整后台文件清单。只有这一步成功才开始生成安装包。

候选树 `48ba9a1a8695db845b44623916614f7da2a24571` 在 Fedora 45 x86_64 通过组装目录的完整清单校验。通过随包 CLI 查询得到 DSHU `2026.11.25.0`，随包 Node 报告 `v24.22.3`。在独立 X11 显示器和空资料目录启动桌面，点击欢迎页的 API Key 入口，再选“稍后配置”，进入工作区。实测工作区视口为 1280 × 792。账号菜单能打开关于页，左侧品牌区与弹窗上、左边缘的坐标完全一致，左侧显示 DSHU 日期版本，右侧显示内核 `0.2.3-alpha.2` 和候选树短标识，源码字段保留完整树值。Esc 可以关闭。桌面导航中没有插件“更多”按钮。此项验收未使用模型密钥。

Fedora 45 上，electron-builder 下载的 FPM 1.17.0 使用 Ruby 3.4.3，需要兼容库 `libcrypt.so.1`。缺少时，musl 编译预检可以通过，首次生成 deb 时会收到退出码 127。构建机使用 Fedora 签名的 `libxcrypt-compat-4.5.2-4.fc45.x86_64.rpm`，SHA-256 为 `2bbafb3a6f0c07fccbba0fabc8670824f2780341c02533713ae8b1cd7b552d0c`。先用 `rpmkeys -Kv` 校验签名，再将库解到用户构建目录，仅向打包命令提供对应的 `LD_LIBRARY_PATH`。FPM 的 `--version` 应返回 `1.17.0`。

### Linux x64 未签名安装包与回执

以下三个文件来自 Fedora 45 x86_64 的同一次构建。目标机用主线还原脚本检出固定上游并应用补丁，客户端构建记录和桌面关于页共同确认基线 `4b399c39a6d1`、提交时间 `2026-11-22 08:50 UTC` 和候选树 `48ba9a1a8695`。Linux 包管理器登记版本为 `2026.1125.0`，RPM 的 Release 字段为 `1`。CLI 与关于页均显示产品日期版本 `2026.11.25.0`。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `deepseek-harness-uncensored-2026.11.25.0-linux-amd64-unsigned.deb` | 298,585,604 | `1b22a114e0a78a83e391c980a8608e2a4671eae645c24e91f04b6f34107a4161` |
| `deepseek-harness-uncensored-2026.11.25.0-linux-x86_64-unsigned.rpm` | 249,259,997 | `958e40a9f20944eca296dc2a1d2ceaeb5c9585a045a3fd6f8e5899fd591d91be` |
| `deepseek-harness-uncensored-2026.11.25.0-linux-x64-unsigned.tar.gz` | 364,673,905 | `639bf99b452eb912c5611208abc6ea89614f614a31f47c23e53d43eb19fdce07` |

| 环境 | 实测结果 |
| --- | --- |
| Debian 13 amd64 | 在独立系统容器中用 apt 安装 deb，以普通用户启动随包 CLI。同版重装前后，包登记和用户标记保持一致。两个正式版写出的压缩 v4 会话分别完成续写和重开。 |
| Fedora 44 x86_64 | 在独立系统容器中用 dnf 安装 RPM，同版重装后以普通用户重新打开两份历史会话。包登记、CLI 和用户标记均通过核对。 |
| Fedora 45 x86_64 | 另外从 deb 解包，在隔离的 X11 显示器启动桌面。tar.gz 完整解压后独立运行 CLI 和随包 Node。三个归档内的关键文件均与组装结果一致。配置 XDG 文档目录的新用户可以从欢迎页进入工作区，应用创建默认工作区并显示关于页。 |

本轮首次对最终组装目录做运行时检查时，临时构建目录的符号链接与进程报告的物理路径不同，导致路径核对失败。将同一批文件按字节和权限核对后放回标准物理输出目录，重新执行三种归档检查和原有的完整运行时检查，均通过。复测包括离线安装与移除插件、PNG、PTY、后台启动，以及 Office 转换和重算。

维护机交付目录为 `%USERPROFILE%/DSHU-Deliveries/20261125/linux-x64-candidate/48ba9a1a86/upstream-4b399c39/`。其中 `result.json` 对应归档与启动结果，`deb-manager.json` 和 `rpm-manager.json` 记录包登记和两代会话，`workspace.json`、`about-zh.json` 和中英文 PNG 记录实际界面。以上均为缺省与写作的未签名候选。两种包已验证首次安装及同版重装，旧版 Linux 安装包直接覆盖升级、实体桌面门户、Linux arm64 及 macOS arm64 的发行验收仍待完成。

### 在 Linux 安装目录复验旧会话

从两个正式版的受控测试资料各取一份压缩 v4 会话及其 `prediction-events.json`，每个版本使用独立副本。原始写入提交为 `95325688c913` 和 `7eaeddc6050e`。测试会话保存了用户的第一句话、输入建议的请求与结果。先记录两个原件的 SHA-256。安装后以普通用户操作副本，从应用安装目录启动[会话检查](../../kernel/0.2.3-alpha.2/verification/installed-composer-session.mjs)。

```sh
runtime='/opt/DeepSeek Harness Uncensored/resources/runtime'
node_bin="$runtime/primary-runtime/dependencies/node/bin/node"
"$runtime/cli/bin/dsh-uncensored" --version
"$node_bin" ./installed-composer-session.mjs continue "$fixture" "$fixture/prediction-events.json"
# 使用相同的 deb 或 RPM 从包管理器重装，再启动一个新进程。
"$node_bin" ./installed-composer-session.mjs reopen "$fixture" "$fixture/prediction-events.json"
```

每次将 `fixture` 设为对应版本的副本目录。`continue` 先逐字段核对原始建议事件及其顺序，确认只有已发送的文字出现在对话中，再追加第二句话。`reopen` 从磁盘读回两句话和原始建议。另比较用户目录中独立标记文件在重装前后的 SHA-256，复核包管理器登记和 CLI 版本。

## 桌面与平台验收

| 目标 | 对照安装形式 | 本轮发行候选验收 |
| --- | --- | --- |
| Windows x64 | exe | 缺省与写作的未签名安装器、保留资料及冷启动结果见上表。四模式包、正式签名与真实在线更新仍待验收。 |
| Linux x64 | deb、rpm 分别验证 | Debian 13 和 Fedora 44 已分别验证首次安装、同版重装及两代会话。Fedora 45 已验证解包后的桌面和便携 CLI。旧系统覆盖升级与实体桌面门户待验。[逐包摘要与回执](#linux-x64-未签名安装包与回执)。 |
| Linux arm64 | deb | 已接入 deb 和 tar.gz 打包入口。待原生构建、在包管理器中安装并验证启动与已有资料。 |
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
