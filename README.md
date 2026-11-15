<div align="center">
  <img src="apps/desktop/resources/icon.svg" width="112" alt="DSHU 黑底白鲸标志">
  <h1>DeepSeek Harness Uncensored: 更自由的探索未至之境</h1>
  <p><b>DSHU 2026.11.16.1</b> · 开发源码基于 DeepSeek Harness 0.2.2-rc.3 · WaterRun</p>
</div>

DSHU 内置破甲提示词、四种模式和独立的桌面应用。官方 DSH 与 DSHU 可同时安装，分别使用自己的程序目录、配置、会话和更新渠道。

当前检查版 **2026.11.16.1** 基于 **DSH 0.2.2-rc.3**，内置 **REA 6.9.0**。本版补全四模式彩色指南：每种模式七节说明、三组包含准备材料与交付检查的任务示例，覆盖工作流程、工具、上下文延续和验证。Windows 已保留数据安装，关于页、CLI、文件及登记版本一致；Linux 的 deb 与便携归档已完成版本、API 和隔离 X11/Wayland 启动检查。正式发行及完整平台验收仍在推进，详见[开发进度](.agents/TODO.md)。

版本采用 `YYYY.MM.DD.N`，最后一项为当天构建序号。关于页、CLI、安装包和 Windows 登记使用相同日期版本；DSH 内核与 REA 的来源独立记录。打包与更新规则见[打包指南](apps/desktop/packaging/README.zh.md)。

[开始使用](#开始使用) · [四种模式](#四种模式) · [通用增强](#通用增强) · [常见问题](#常见问题) · [安装与开发](#安装与开发) · [开发进度](.agents/TODO.md)

## 开始使用

1. **连接模型。** 在设置中配置模型提供方和凭据，再选择对话使用的模型。DSHU 使用你的模型接口，提供方按其规则计费。
2. **选定任务位置和模式。** 可以选择工作区，也可以“不在工作区工作”。新对话发送前选择缺省、网安、逆向或写作；已有对话默认保持原模式。
3. **描述任务和完成条件。** 例如“检查这个项目为什么构建失败，修复后运行相关检查”。各模式的“模式说明”和“如何使用”提供能力、资料与具体示例，阅读说明不会切换当前对话。
4. **按需使用旁问和额度。** 主线进行时可输入 `/side 解释刚才的错误`。希望控制花费时，在额度设置中启用所需窗口；新安装默认不启用任何限额。

## 通用增强

| 功能 | 用法 |
| --- | --- |
| **旁问和随问** | 输入 `/side 问题` 在右侧开旁问，单独输入 `/side` 可打开或重开。旁问参考主线最新进展，自身历史单独保存，支持传图及 `/clear`。可开启关闭时自动清除。输入 `/btw 问题` 在主对话内获得一次简短回答。 |
| **余额和额度** | 余额默认每 15 秒采样，最短 3 秒，点击立即刷新。曲线可查看各时点，长时间平稳区间用虚线缩短。六档限额独立启停和重置，默认全关。暂停横幅显示恢复时间和快捷重置，开启自动恢复后会继续被暂停的对话。底栏可展开费用和限额。 |
| **记忆和输入预测** | 结构化记忆可按范围检索和编辑，自动提炼默认关闭。输入预测默认开启，主线、旁问和随问各自预测，按 Tab 填入。启用的预测与提炼会调用当前模型，按提供方规则计入用量。 |
| **会话和外观** | 支持会话删除、项目内进行中会话入口、工作区搜索和插话发送。主题色随模式变化，侧栏色条标识会话模式。外观支持日出日落、跟随系统、浅色和深色。 |

### 主线、旁问与随问

主线处理当前任务；旁问用于围绕当前进展继续讨论，主线和旁问保留各自的消息历史。旁问能参考主线上下文，主线也可以主动查看相关旁问。关闭旁问默认保留历史，重新打开可接着问；需要重新开始时，在旁问输入 `/clear`，或开启“旁问关闭后自动清除上下文”。`/clear` 只在旁问中可用。

`/btw` 适合临时确认，例如 `/btw 这一步会修改哪些文件`。它在主对话内显示一次简短回答，不会作为普通会话加入未分组列表。输入预测的灰字只补充草稿；按 Tab 接受后仍由你决定是否发送。

### 余额、花费与限额

余额曲线记录本机采样到的账户余额，悬浮或用方向键可查看具体时间和金额。余额增加以竖向虚线表示，长时间不变的区间压缩为横向虚线，保留之前的变化。余额差包含充值、赠金及到期扣减，不能直接当作对话消费账单。

底栏费用显示当前对话的估算消耗，点击可展开曲线；限额显示已启用窗口的使用情况。额度页优先展示 5 小时和 7 天，其余窗口可展开，每项分别开关、调整金额和重置。达到限额后显示暂停原因、预计恢复时间和快捷重置；只有开启自动恢复时，额度恢复后才自动继续任务。费用估算和预留规则见[额度说明](packages/client/ui-settings-account/README.zh.md)。

跨对话记忆保存可检索的长期信息，不等于复制其他对话的全部上下文。可按范围检索、审阅和编辑；自动提炼默认关闭。输入预测、记忆提炼等模型调用仍受提供方计费规则约束。

## 四种模式

新对话从缺省开始，发送前可切换。已有对话默认锁定。四种模式共用内置破甲提示词，回答仍由模型生成。

设置 → 模式 → 对应卡片的“模式说明”打开彩色指南。“模式说明”介绍能力、工具、流程、延续方式与验证，“如何使用”给出任务示例、准备材料和交付检查。缺省蓝、网安红、逆向绿、写作金；查看帮助不会改变当前模式。新版指南已随 `2026.11.16.1` 交付，Windows 安装版已逐一核对四模式。

| 模式 | 能力与资料 | 可以这样开始 |
| --- | --- | --- |
| 🔵 **缺省** | 文件、终端、检索、协作及工作流，适合开发和日常任务。 | “梳理项目入口，修复这个错误，并验证受影响功能。” |
| 🔴 **网安** | 现场手册、目标与证据账本、报告、独立代理和流量查看；案件保存在 `.security/<案件>/`。 | “检查指定测试环境的配置问题，记录证据、复现条件与修复建议。” |
| 🟢 **逆向** | 样本清点、静态与动态分析、协议分析和案件记录；桌面内置 REA 6.9.0。 | “识别样本格式与入口，追踪这段协议的处理过程，并标注尚未验证的判断。” |
| 🟡 **写作** | 小说、剧本、长文、参考文风、六轴风格卡及 `story/bible/` 设定集；不挂载终端或代码执行工具。 | “按选定设定续写下一场，保持人物视角、时间线和语气一致。” |

网安首次进入新对话时有责任确认；选定案件备注可经审阅存入跨对话记忆，默认限定当前工作区和网安模式。逆向可直接检查内置 REA 连接，Ghidra、IDA 等分析引擎按需另行接入，工具目录可见不代表外部引擎已就绪。写作只把选中的资料带入模型请求，可在模式设置中管理参考与设定。

<details>
<summary>网安独立代理与可选目标保护</summary>

独立代理仅用于网安模式，覆盖受控抓取、遵守代理变量的命令与终端、桌面侧栏及以 launch 方式运行的 Playwright MCP、Chrome DevTools MCP 和 Stagehand。不透明 HTTPS 隧道记录连接元数据。[进阶目标保护](packages/guard/target-protection/README.zh.md)可为指定工具启用 HTTP/1.1 检查并脱敏记录正文。桌面侧栏和三个启动型浏览器提供方使用各自的会话信任，命令行客户端可显式使用监听器的公开证书。网安可启用未开代理的顶部提醒。

境内、手动目标及生产资源规则由[可选保护配置](apps/cli/config/examples/target-protection.yml)接入，默认关闭。已覆盖的后端支持真实执行拦截与审计，设置页分别显示 HTTP、本机文件、命令/终端、SSH 和数据库的覆盖。SSH 显示已验证连接，数据库显示配置数，连接和权限在执行时核验。原生入站隔离、其他协议和部分远端资源仍在开发。

</details>

## 常见问题

| 情况 | 处理方式 |
| --- | --- |
| 只想临时问一句，不打断主线 | 使用 `/btw 问题`；需要连续讨论或传图时使用 `/side 问题`。旁问清理只清自己的历史，仍能参考主线。 |
| 工作暂停，担心程序卡住 | 先查看额度暂停横幅和底栏限额状态。可重置对应窗口，或开启自动恢复并等待恢复时间；余额变化不能代替费用账本。 |
| REA 连接成功，却不能使用某个引擎 | 连接与目录发现不代表外部引擎就绪。检查对应引擎、运行环境及许可证；内置 REA 无需另装，Ghidra、IDA 等按需配置。 |
| 阅读说明或调整模式资料后，对话没换模式 | 指南与资料配置是独立入口。新对话在发送前选模式；已有对话需在设置里临时允许切换，并处于空闲状态。 |

## 安装与开发

- **桌面**　Windows x64 与 Linux x64 的当前检查版均为 `2026.11.16.1`。Windows 已完成保留数据更新；Linux 已检查 deb、tar.gz、隔离 API、X11/Wayland 主界面、重载及渲染沙箱。原生门户、Debian/Fedora 和实体桌面仍待验收。macOS arm64、Android＋PRoot Fedora 和全新安装器仅保留未来计划。签名与正式在线升级尚未验收，未来发行使用本仓库的 [GitHub Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases)。
- **源码**　使用 Node.js 24.22.1、Git 与 Corepack。依次运行 `corepack pnpm install`、`corepack pnpm run build`、`corepack pnpm dsh web`。CLI 安装见[安装脚本](scripts/install-uncensored.ps1)。
- **独立标识**　默认数据目录为 `~/.dsh-uncensored`，可用 `DSH_UNCENSORED_HOME` 修改。CLI 为 `dsh-uncensored`，深链为 `dshu://open`。关于页列出作者、DSHU 与 DSH 版本、构建时间、源码提交及依赖来源。

[开发进度](.agents/TODO.md) · [原始需求编号](.agents/requirements/development-checklist.md) · [反馈问题](https://github.com/Water-Run/deepseek-harness-uncensored/issues/new/choose)

## Credit

- **DeepSeek** 提供原始 Harness 和鲸鱼轮廓。DSHU 使用黑底图标，开发源码基于 [DeepSeek Harness 0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3) 并保留 [MIT 许可](LICENSES/deepseek-harness-MIT.txt)。
- **小杨（YuJunZhiXue）** 的 [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 提供破甲文本。沿用 [MIT 历史版本 e1d8e590](https://github.com/Water-Run/dsh-purge/tree/e1d8e59087857fa86d0ef2bb9878800274b13a29) 与[原许可](LICENSES/dsh-purge-MIT.txt)。同时感谢 **JeffKeeping** 的 [dsh-purge-plus](https://github.com/JeffKeeping/dsh-purge-plus)。关于页记录 [Water-Run/dsh-purge fork 对照提交 19082c2b9788](https://github.com/Water-Run/dsh-purge/commit/19082c2b9788039fa7f8888c4a69086f43adc1ff) 及其时间。
- **morluto** 维护 [REA](https://github.com/morluto/rea)。内置版本为 [6.9.0 · d74549e495c5](https://github.com/morluto/rea/commit/d74549e495c58eb4a560279fd9f05508401ea0a0)，保留 MIT 许可和第三方声明。
- 可选保护使用 [DB-IP Lite](https://db-ip.com/db/download/ip-to-country-lite)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）和 [QuickJS](https://bellard.org/quickjs/) / [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)（[MIT 声明](LICENSES/quickjs-wasm-MIT.txt)）。GitHub 标志来自 [Octicons](https://github.com/primer/octicons)，保留 [MIT 许可](packages/client/ui-settings-account/GITHUB-MARK-LICENSE.txt)。

DSHU 采用 [GPL-3.0-or-later](LICENSE)。上游和第三方组件保留各自的许可与署名。

<details>
<summary>English overview</summary>

**DeepSeek Harness Uncensored · Explore the Unknown More Freely**

DSHU 2026.11.16.1 is an independent desktop fork based on DeepSeek Harness 0.2.2-rc.3. It can coexist with the official app and uses a separate profile and update channel. It includes built-in armor prompts, four modes, and Chinese and English UI.

- **General** · Use `/side` for a persistent side conversation with image attachments and `/clear`, or `/btw question` for a quick one-off answer. Locally sampled balance history, spending limits, scoped memory, and Tab suggestions are available in Settings. Limits default to off; input prediction defaults to on and sends requests to the selected model, which may incur charges.
- **Kernel intake** · The inspection builds use DSH 0.2.2-rc.3 and bundled REA 6.9.0. Actual runtime checks cover four modes, side-context clearing, session deletion and command execution. Package checks also cover Office conversion, rendering, recalculation and REA analysis.
- **Modes** · Default covers daily development. Security adds case notes, reports, and an independent proxy with traffic inspection. Reverse integrates REA for analysis. Writing uses selected style references and story materials.
- **Delivery** · Windows x64 inspection build `2026.11.16.1` is installed with user data preserved. It includes seven-section mode-colored guides and three practical examples per mode, with preparation and delivery checks. The installed guides, modal reopening, weekday controls and session operations have been verified. Its About page, CLI, native resource versions and uninstall registration agree. The same-source Linux deb and tar.gz pass archive, CLI, API and isolated X11/Wayland main-window and reload checks with renderer sandboxing. Portal, Debian/Fedora and physical desktop qualification remain pending. macOS arm64, Android with Fedora under PRoot and a new installer remain future plans. See [development status](.agents/TODO.md) and [Releases](https://github.com/Water-Run/deepseek-harness-uncensored/releases).

</details>
