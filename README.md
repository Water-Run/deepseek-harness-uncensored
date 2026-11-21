<div align="center">

<img src="apps/desktop/resources/icon.svg" width="104" alt="DSHU 黑底白鲸标志">

# DeepSeek Harness Uncensored

**更自由的探索未至之境**

[![预发布](https://img.shields.io/badge/%E9%A2%84%E5%8F%91%E5%B8%83-2026.11.17.5-2563EB?style=flat-square)](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5) [![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20x64-0F172A?style=flat-square)](#安装与数据) [![基于](https://img.shields.io/badge/%E5%9F%BA%E4%BA%8E-DeepSeek%20Harness%200.2.2--rc.5-15803D?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5) [![许可](https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-GPL--3.0--or--later-A16207?style=flat-square)](LICENSE)

[四种模式](#四种模式) · [旁问与随问](#旁问与随问) · [余额与限额](#余额与额度限制) · [记忆与预测](#跨对话记忆) · [使用手册](docs/user/guide/dshu.md) · [下载](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/dshu/hero-dark.webp">
  <img src="docs/assets/dshu/hero-light.webp" alt="DSHU 新会话首页：更自由的探索未至之境">
</picture>

**DeepSeek Harness Uncensored（DSHU）** 是基于 DeepSeek Harness 的桌面智能体工作台。破甲提示词已经内置，装好就是开箱即用的破甲体验，不用自己找提示词、改配置。软件开发、网络安全、逆向工程、创作写作，每个方向都有一套专属模式，选好就能上手干活。

除此之外，DSHU 还补齐了一些日常用得上的东西：任务跑着也能插话的旁问和随问，看得见的余额曲线，可选的 5 小时与周限额，跨对话记忆，以及替你把半句话写完的输入预测。

> [!NOTE]
>
> DSHU 有自己的程序目录、配置、会话和更新渠道，和官方 DeepSeek Harness 装在同一台机器上也互不打扰。

## 四种模式

<img src="docs/assets/dshu/modes-overview.webp" alt="四种模式：缺省（蓝）、网安（红）、逆向（绿）、写作（金），各自的定位与核心能力">

四种模式共用同一套破甲提示词，差别在于各自带的工具、工作手册和资料。手册不会一股脑塞进上下文，模型用到哪本才读哪本。每种模式有自己的主题色，会话标题、侧栏色条、发送按钮都会跟着变，扫一眼就知道手上是哪类活。

| 模式 | 主题色 | 擅长 | 专属资料 |
| --- | --- | --- | --- |
| 缺省 | <img src="docs/assets/dshu/swatch-default.svg" alt="蓝 #2563EB"> | 写代码、查问题、整理资料等日常任务 | 当前工作区 |
| 网安 | <img src="docs/assets/dshu/swatch-security.svg" alt="红 #DC2626"> | 应用审查、配置检查、问题复现与修复验证 | `.security/` 案件 |
| 逆向 | <img src="docs/assets/dshu/swatch-reverse.svg" alt="绿 #15803D"> | 程序、二进制、文件格式与协议分析 | `.reverse/` 案件 |
| 写作 | <img src="docs/assets/dshu/swatch-writing.svg" alt="金 #A16207"> | 小说、剧本与长文 | `story/` 文风与设定 |

新会话默认是缺省，发出第一条消息前可以随便换；发出之后模式就定下来，免得聊到一半工具和手册全变了。真要换，去设置里临时打开切换开关即可，重启后自动关回去。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/dshu/flow-mode-lock-dark.webp">
  <img src="docs/assets/dshu/flow-mode-lock-light.webp" alt="模式的选择与锁定：新会话默认缺省，发送前自由选择，发送后锁定，可在设置中临时允许切换">
</picture>

### 缺省模式

日常的主力模式。读写文件、跑命令、查资料、拆任务，一个需求交给它，从定位问题到改完验证都能自己推进。完成后它会说清楚改了哪些文件、实际跑了哪些检查，没跑的也会单独列出来，不拿“应该没问题”糊弄你。

- **工作区**：读取、搜索、编辑文件，运行构建和测试；只是问问题的话，也可以不选工作区。
- **工具**：网页检索、看图、浏览器与 MCP 工具、Office 文档的生成和转换。
- **长任务**：任务清单、计划、目标、子任务委派和工作流，按需加载技能。

<img src="docs/assets/dshu/mode-default.webp" alt="缺省模式会话：列出任务清单、搜索并读取文件、修改代码，最后给出修复说明">
<p align="center"><sub>缺省模式 · 定位搜索竞态、修改代码并交代修复结果</sub></p>

### 网安模式

给安全工作准备的模式。方法有手册，过程有案件记录，网络出口可以单独走一条代理。目标、证据、发现都会落到文件里，下次打开会话还能接着查，最后一键整理成报告。

- **七类现场手册**：交战流程、侦察、Web 攻击、网络利用、载荷实验、云与容器、报告，按调查阶段取用。
- **案件记录**：每个案件一个 `.security/<案件>/case.json`，记下目标、证据、发现和备注，可以生成 Markdown 报告；审阅过的备注能存进记忆。
- **独立代理**：默认关闭。打开后，网安会话访问目标的流量统一从你指定的代理出去，模型请求、登录、余额查询仍走原来的网络。流量可以筛选、查看详情、导出脱敏 JSON。
- **进入确认**：第一次在新会话里进入网安，会先请你读完责任说明，必要时输入一段声明。
- **目标保护**：境内网站、指定目标和生产资源的拦截规则属于进阶功能，默认全关，需要时自己打开。

> [!WARNING]
>
> 网安模式会执行真实命令、访问真实目标。软件不会替你判断目标是否已获授权，请只在授权范围内使用。

<img src="docs/assets/dshu/mode-security.webp" alt="网安模式会话：读取上传路由、确认路径穿越并写入案件记录，顶部提示独立代理未开启">
<p align="center"><sub>网安模式 · 发现上传接口的路径穿越并写入案件；顶部是独立代理未开启的提醒</sub></p>

<table>
<tr>
<td width="50%" valign="top"><img src="docs/assets/dshu/security-entry.webp" alt="进入网安模式前的确认弹窗"></td>
<td width="50%" valign="top"><img src="docs/assets/dshu/materials-security.webp" alt="设置中的网安资料：案件列表与独立代理设置"></td>
</tr>
<tr>
<td align="center"><sub>首次进入的确认</sub></td>
<td align="center"><sub>案件与独立代理（设置 → 模式 → 网安）</sub></td>
</tr>
</table>

<details>
<summary>独立代理与目标保护的覆盖范围</summary>

- **代理范围**：只在网安模式生效，覆盖受控网页抓取、遵守代理变量的命令与终端、桌面侧栏浏览器，以及以 `launch` 方式启动的 Playwright MCP、Chrome DevTools MCP 和 Stagehand。
- **流量正文**：没被拦截的 HTTPS 隧道只记录连接信息；[进阶目标保护](packages/guard/target-protection/README.zh.md)可以为指定工具开启 HTTP/1.1 检查并脱敏记录正文。
- **保护规则**：通过[可选保护配置](apps/cli/config/examples/target-protection.yml)接入，已覆盖的执行后端会在真正执行前拦截并留下审计记录。
- **尚未覆盖**：入站隔离、其他协议和部分远端资源还在做，开关打开不代表这些场景已经受保护。

</details>

### 逆向模式

拿到一个样本，从初筛、静态分析、动态调试到协议还原都有章法。逆向模式要求结论落到地址、偏移和运行观察上，推测和验证过的东西分开说，没确认的部分记进案件，下次接着来。

- **八类分析手册**：初筛、静态、动态、协议、补丁与注册机、移动端、恶意样本、案件簿。
- **内置 REA 6.9.0**：装好就有，不用另装。每个逆向会话独占一个分析进程，自带 JavaScript 分析和 Frida 绑定；Ghidra、IDA、Hopper 等引擎按需接入。
- **样本清点**：只读样本字节，算出 SHA-256、格式、熵和可打印字符串，不执行样本。
- **分析案件**：`.reverse/<案件>/case.json` 记下样本、证据、发现和待验证的假设。

<img src="docs/assets/dshu/mode-reverse.webp" alt="逆向模式会话：固件头字段布局表、解码器代码和尚未确认的字段">
<p align="center"><sub>逆向模式 · 还原固件头布局、写出解码器，未确认的字段记入案件</sub></p>

<img src="docs/assets/dshu/materials-reverse.webp" alt="设置中的 REA 分析面板与逆向资料">
<p align="center"><sub>REA 与逆向资料（设置 → 模式 → 逆向）</sub></p>

### 写作模式

写长篇最怕前后对不上：人物忘了自己知道什么，文风写着写着就漂了。写作模式把人物、设定和文风放在手边，只把你勾选的那几份交给模型，续写、修订、规划章节都对着同一份底稿。正文和编辑意见分开给，不会在小说里夹一段“以下是修改说明”。

- **七类写作手册**：写作基本功、声音、场景、黑暗素材、连续性、文风参考、长篇结构。
- **文风卡**：用措辞、句法、节奏、意象、对白、结构六条轴描述一种文风，再补上标志性手法、绝不会做的事和一段校准样例。
- **设定集**：`story/bible/` 放人物、世界、时间线和已经定下的事实，`story/style/` 放文风卡。
- **专注写作**：不挂载终端和代码执行工具。

<img src="docs/assets/dshu/mode-writing.webp" alt="写作模式会话：读取人物设定后续写第七章正文，结尾附连续性检查">
<p align="center"><sub>写作模式 · 对照人物设定续写第七章，连续性检查单独列在正文之后</sub></p>

<img src="docs/assets/dshu/materials-writing.webp" alt="设置中的写作资料：文风卡与设定集，勾选后用于写作">
<p align="center"><sub>写作资料：勾选“用于写作”的才会发给模型</sub></p>

### 模式说明与设置

每种模式都附了一份说明，分“模式说明”和“如何使用”两页，后者有可以直接抄走的示例任务。设置 → 模式页集中管理四种模式的说明、资料和切换开关。

<details>
<summary>查看四种模式的说明弹窗与模式设置页</summary>

<table>
<tr>
<td width="50%"><img src="docs/assets/dshu/mode-guide-default.webp" alt="缺省模式说明"></td>
<td width="50%"><img src="docs/assets/dshu/mode-guide-security.webp" alt="网安模式说明"></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/dshu/mode-guide-reverse.webp" alt="逆向模式说明"></td>
<td width="50%"><img src="docs/assets/dshu/mode-guide-writing.webp" alt="写作模式说明"></td>
</tr>
</table>

<img src="docs/assets/dshu/mode-settings.webp" alt="设置中的模式页">

</details>

## 通用增强

### 旁问与随问

主线在干活，你突然有个问题想问，又不想打断它，这正是旁问和随问要解决的事。两者都不会打断主线，也不会在侧栏多出一堆会话。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/dshu/flow-asides-dark.webp">
  <img src="docs/assets/dshu/flow-asides-light.webp" alt="主线、旁问与随问的上下文：旁问获得已完成的进展，随问获得包括进行中步骤在内的实时进度">
</picture>

| | 旁问 `/side` | 随问 `/btw` |
| --- | --- | --- |
| 适合 | 想多聊几句：讨论方案、追问细节、附图提问 | 只问一句：进度如何、这个报错什么意思 |
| 能看到主线的 | 已经完成的进展 | 实时进度，连正在跑的那一步也算 |
| 权限 | 和主线一致 | 只读，不改文件、不跑命令 |
| 去哪儿看 | 右侧标签页，关掉再开还在 | 输入框上方的一张小卡片 |

#### 旁问 /side

在右侧另开一个对话，接着主线的上下文聊。每次提问前，旁问都会同步主线刚完成的进展；它自己的聊天记录单独保存，关掉标签也不会丢，主线需要时也能翻看。可以附图，想重新开始就在旁问里发 `/clear`。

<img src="docs/assets/dshu/side-question.webp" alt="旁问：主线写好发布说明草案，右侧旁问讨论第二条怎样写得更易懂">
<p align="center"><sub>主线写完草案，在旁问里单独琢磨其中一条的写法</sub></p>

> [!NOTE]
>
> 旁问里商量好的事，主线并不会自动去做。拿定主意后，回主输入框交代一句就行。

#### 随问 /btw

任务跑到一半，想知道它到底在干嘛？输入 `/btw 进度如何` 就够了。随问会看一眼主线的实时状态：当前在第几步、任务清单勾到哪了、刚刚调用了什么工具，然后给你一段简短的回答。主线继续跑，计时器都不会停。

随问只有只读权限，回答默认不超过 512 token，思考等级默认“低”，又快又省。每次 `/btw` 都是新的一问，新卡片会替换旧卡片。

<img src="docs/assets/dshu/btw-progress.webp" alt="主线仍在运行时，随问卡片回答当前进度">
<p align="center"><sub>主线还在跑，<code>/btw 进度如何</code> 直接报告做到了哪一步</sub></p>

### 输入预测

打字停顿一下，输入框里就会出现灰色的后半句，按 <kbd>Tab</kbd> 收下，不满意就接着打。主线、旁问和随问各自预测，互不干扰。它只负责补全，发不发由你决定。预测会调用当前模型、会计费，不需要可以在设置里关掉。

<img src="docs/assets/dshu/input-prediction.webp" alt="输入框中的灰色预测文字">
<p align="center"><sub>灰色部分是预测，按 Tab 填入</sub></p>

### 余额与额度限制

**余额**：侧栏一直显示账户余额，还会标出当前是官网的高峰还是低峰时段、离下次切换还有多久。设置 → 额度里有一条本机采样的余额曲线，默认 15 秒采一次，悬停就能看到每个时间点的金额；余额长时间不动的区间会自动压缩成虚线，不让平稳时段占满整张图。

<img src="docs/assets/dshu/balance.webp" alt="余额曲线与悬停读数">
<p align="center"><sub>两天的余额曲线；横向虚线是被压缩的平稳时段</sub></p>

**额度限制**：如果你用惯了各家 Coding Plan，养成了时不时瞄一眼额度百分比的习惯，DSHU 也照顾到了。可选的额度限制里，经典的 5 小时限额和周限额都在，另有 15 分钟、1 小时、1 天、30 天可选。区别在于，这回上限由你自己定。

- 六档窗口各自开关、各自设金额，默认全关。
- 每次请求前先预留费用，用完按实际结算，所以跑着的请求会暂时占一点额度。
- 额度用完时对话自动暂停，告诉你大概什么时候能继续；打开“自动恢复”后，额度一回来就接着跑。

<table>
<tr>
<td width="50%"><img src="docs/assets/dshu/spend-limits.webp" alt="额度限制设置"></td>
<td width="50%"><img src="docs/assets/dshu/spend-pause.webp" alt="对话因额度限制暂停的横幅"></td>
</tr>
<tr>
<td align="center"><sub>设置 → 额度</sub></td>
<td align="center"><sub>额度用完，对话暂停并给出预计恢复时间</sub></td>
</tr>
</table>

> [!CAUTION]
>
> “重置限额统计”只清零本地的计数，不会充值，也不会退回提供方已经扣掉的钱。余额、费用和限额都是本地估算，不是账单。

### 跨对话记忆

说过一次的事，不用每个新对话再说一遍。项目约定、个人偏好、做过的结论、小说设定，都可以存成记忆，之后的对话需要时自己去查。每条记忆都有明确的作用范围：全局、某个工作区、某种模式，或者两者叠加，不会串到不相干的地方。

- 四种类型：偏好、项目事实、操作结论、写作设定。
- 可以搜索、筛选、编辑、停用、删除；网安案件里审阅过的备注也能一键存入。
- 自动提炼默认关闭。打开后每轮对话结束会让模型整理一次，会计费。

<img src="docs/assets/dshu/memory.webp" alt="跨对话记忆管理">
<p align="center"><sub>设置 → 通用 → 管理记忆</sub></p>

## 其它小改进

| 改进 | 说明 |
| --- | --- |
| 底栏状态 | 输入框下方显示轮次与步数、生成速度、token 用量与缓存命中、本对话费用和限额进度 |
| 对话费用 | 点开底栏金额，看到这个对话的累计费用曲线；点开限额项，看各窗口用了多少 |
| 侧栏模式色条 | 每个会话左边一条模式色，运行中、置顶、等待审批一目了然 |
| 会话管理 | 置顶与普通会话分区拖动排序；分叉会继承原会话的模式；归档随时找回 |
| 彻底删除 | 删除对话会先停下任务，再连同旁问、随问和子会话一起删掉，工作区文件不动 |
| 日出日落主题 | 默认按所在时区估算日出日落，白天浅色、晚上深色；也可固定浅色、深色或跟随系统 |
| 敏感操作确认 | 进入网安、切换已有会话的模式前要求确认，默认开启 |
| 关于与更新 | 关于页列出 DSHU 与 DSH 版本、源码节点、dsh-purge 与 REA 来源，可直接检查 GitHub 更新 |

<details>
<summary>查看侧栏、会话菜单、删除确认、外观与关于页</summary>

<table>
<tr>
<td width="50%"><img src="docs/assets/dshu/sidebar.webp" alt="侧栏模式色条"></td>
<td width="50%"><img src="docs/assets/dshu/session-menu.webp" alt="会话菜单"></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/dshu/spend-footer.webp" alt="底栏限额进度"></td>
<td width="50%"><img src="docs/assets/dshu/delete-dialog.webp" alt="删除对话确认"></td>
</tr>
<tr>
<td width="50%"><img src="docs/assets/dshu/appearance.webp" alt="外观设置"></td>
<td width="50%"><img src="docs/assets/dshu/about.webp" alt="关于页"></td>
</tr>
</table>

</details>

## 安装与数据

| 项目 | 说明 |
| --- | --- |
| 下载 | [预发布 2026.11.17.5](https://github.com/Water-Run/deepseek-harness-uncensored/releases/tag/v2026.11.17.5)：Windows x64 为首发平台，Linux x64 提供检查包 |
| 首次配置 | 设置 → 模型中填写提供方与凭据，详见[模型配置](docs/user/guide/providers.zh.md) |
| 版本号 | `YYYY.MM.DD.N`，末位是当天的构建序号，可在关于页核对 |
| 数据目录 | 默认 `~/.dsh-uncensored`，可用环境变量 `DSH_UNCENSORED_HOME` 修改 |
| 与官方版并存 | 程序、配置、会话和更新渠道各自独立 |

> [!IMPORTANT]
>
> 更新前请先关闭 DSHU，备份数据目录和重要的工作区文件。正式签名、在线升级和自动回退还在验收中，进度见[开发清单](.agents/TODO.md)。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [使用手册](docs/user/guide/dshu.md) | 第一个任务、各模式用法、默认值、数据恢复、故障排查和功能入口速查 |
| [模型配置](docs/user/guide/providers.zh.md) | 模型提供方、凭据与自定义接口 |
| [模式资料](packages/client/ui-mode-materials/README.zh.md) · [REA 接入](packages/mcp/rea/README.zh.md) · [执行保护](packages/guard/target-protection/README.zh.md) | 专项功能的技术说明 |
| [开发清单](.agents/TODO.md) · [交付记录](.agents/HANDOFF.md) | 功能进度、验收状态与发布流程 |
| [反馈问题](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose) | 缺陷报告与功能建议 |

## 版本基线

| 组成 | 基线 |
| --- | --- |
| DSHU | 最新公开预发布 `2026.11.17.5` |
| DeepSeek Harness | 源码基于 [0.2.2-rc.5](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.5) |
| 破甲提示词 | dsh-purge 的 [MIT 历史版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29) |
| REA | [6.9.0 · d74549e495c5](https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0) |

## Credit

- **DeepSeek**：提供原始的 DeepSeek Harness 和鲸鱼轮廓，DSHU 图标在此基础上改为黑底。上游代码保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。
- **小杨（YuJunZhiXue）**：[dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 提供破甲提示词，DSHU 沿用其 MIT 历史版本并保留[原许可](LICENSES/dsh-purge-MIT.txt)。关于页记录了 [Water-Run/dsh-purge 的对照提交 19082c2b9788](https://github.com/Water-Run/dsh-purge/commit/19082c2b9788039fa7f8888c4a69086f43adc1ff)及其时间。同时感谢 **JeffKeeping** 的 [dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)。
- **morluto**：维护 [REA](https://github.com/morluto/rea)。DSHU 内置版本保留其 MIT 许可和第三方声明。
- **其他组件**：可选保护使用 [DB-IP Lite](https://db-ip.com/db/download/ip-to-country-lite)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）以及 [QuickJS](https://bellard.org/quickjs/) / [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)（[MIT 声明](LICENSES/quickjs-wasm-MIT.txt)）。GitHub 标志来自 [Octicons](https://github.com/primer/octicons)，保留 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。

DSHU 以 [GPL-3.0-or-later](LICENSE) 发布，上游和第三方组件保留各自的许可与署名。
